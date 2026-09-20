// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title HabitStake — daily commitments on BOT Chain
/// @author HabitStake contributors
/// @notice Commit native BOT, check in once in every consecutive 24-hour window,
///         and recover your principal after the entire commitment period ends.
/// @dev Self-reported check-ins do not prove a real-world habit was performed.
///      There is no owner, upgrade, emergency withdrawal, yield, or rescue path.
///      Missing ANY window permanently makes that habit's stake unclaimable.
///      This code is unaudited. Test with valueless testnet tokens first.
contract HabitStake {
    uint256 public constant DAY = 24 hours;
    uint256 public constant MAX_DAYS = 90;

    enum Status { None, Active, Completed, Failed, Claimed }

    // All fields after stake share one slot; each habit uses two storage slots.
    struct Habit {
        uint256 stake;
        uint64 startedAt;
        uint64 id;
        uint16 totalDays;
        uint16 completedDays;
        bool claimed;
    }

    mapping(address => Habit) private _habits;
    mapping(address => uint256) public forfeitedStake;
    uint64 public habitCount;
    uint256 private _guard = 1;

    error InvalidDuration();
    error InvalidStake();
    error UnfinishedHabit();
    error NoHabit();
    error AlreadyCheckedIn(uint256 nextWindowAt);
    error MissedWindow();
    error StreakAlreadyComplete();
    error IncompleteStreak();
    error RefundNotReady(uint256 unlockAt);
    error AlreadyClaimed();
    error RefundTransferFailed();
    error ReentrantCall();
    error DirectTransfersDisabled();

    event HabitCreated(address indexed user, uint64 indexed habitId, uint256 stake, uint256 totalDays, uint256 startedAt);
    event CheckedIn(address indexed user, uint64 indexed habitId, uint256 dayNumber, uint256 timestamp);
    event StreakCompleted(address indexed user, uint64 indexed habitId, uint256 unlockAt);
    event RefundClaimed(address indexed user, uint64 indexed habitId, uint256 amount);
    event StakeForfeited(address indexed user, uint64 indexed habitId, uint256 amount);

    modifier nonReentrant() {
        if (_guard != 1) revert ReentrantCall();
        _guard = 2;
        _;
        _guard = 1;
    }

    /// @notice Start one commitment for the caller with exactly stakeAmount BOT wei.
    /// @param days_ Number of consecutive 24-hour windows, from 1 through 90.
    /// @param stakeAmount Principal in wei; MUST equal msg.value and be nonzero.
    /// @return habitId The unique identifier of the newly created habit.
    /// @dev Window 1 is [startedAt, startedAt + DAY); it requires a manual check-in.
    ///      A previous failed habit may be replaced, but its principal stays here.
    ///      A completed habit MUST be refunded before creating its replacement.
    function createHabit(uint256 days_, uint256 stakeAmount)
        external payable nonReentrant returns (uint64 habitId)
    {
        if (days_ == 0 || days_ > MAX_DAYS) revert InvalidDuration();
        if (stakeAmount == 0 || msg.value != stakeAmount) revert InvalidStake();

        Habit storage previous = _habits[msg.sender];
        Status previousStatus = _status(previous);
        if (previousStatus == Status.Active || previousStatus == Status.Completed) revert UnfinishedHabit();
        if (previousStatus == Status.Failed) {
            forfeitedStake[msg.sender] += previous.stake;
            emit StakeForfeited(msg.sender, previous.id, previous.stake);
        }

        habitId = ++habitCount;
        _habits[msg.sender] = Habit({
            stake: stakeAmount,
            startedAt: uint64(block.timestamp),
            id: habitId,
            totalDays: uint16(days_),
            completedDays: 0,
            claimed: false
        });
        emit HabitCreated(msg.sender, habitId, stakeAmount, days_, block.timestamp);
    }

    /// @notice Record a self-reported completion in the currently open window.
    /// @dev Windows are anchored to creation time, NOT local midnight and NOT
    ///      the previous check-in. Late check-ins never move the next deadline.
    ///      A window's end is exclusive. Transactions must be MINED before it.
    function checkIn() external nonReentrant {
        Habit storage habit = _habits[msg.sender];
        Status status = _status(habit);
        if (status == Status.None) revert NoHabit();
        if (status == Status.Failed) revert MissedWindow();
        if (status == Status.Claimed) revert AlreadyClaimed();
        if (status == Status.Completed) revert StreakAlreadyComplete();

        uint256 windowIndex = (block.timestamp - uint256(habit.startedAt)) / DAY;
        if (windowIndex < habit.completedDays) {
            revert AlreadyCheckedIn(uint256(habit.startedAt) + uint256(habit.completedDays) * DAY);
        }
        // _status has already rejected any skipped required window.
        habit.completedDays += 1;
        emit CheckedIn(msg.sender, habit.id, habit.completedDays, block.timestamp);
        if (habit.completedDays == habit.totalDays) {
            emit StreakCompleted(msg.sender, habit.id, uint256(habit.startedAt) + uint256(habit.totalDays) * DAY);
        }
    }

    /// @notice Return the caller's original principal after a complete commitment.
    /// @dev Both ALL check-ins and the full duration must be satisfied. Principal
    ///      is returned without yield; gas fees are not refunded. CEI + reentrancy
    ///      guard protect the native-token transfer. A failed receiver reverts
    ///      atomically, keeping the refund claimable for a subsequent attempt.
    function claimRefund() external nonReentrant {
        Habit storage habit = _habits[msg.sender];
        Status status = _status(habit);
        if (status == Status.None) revert NoHabit();
        if (status == Status.Claimed) revert AlreadyClaimed();
        if (status == Status.Failed) revert MissedWindow();
        if (status != Status.Completed) revert IncompleteStreak();

        uint256 unlockAt = uint256(habit.startedAt) + uint256(habit.totalDays) * DAY;
        if (block.timestamp < unlockAt) revert RefundNotReady(unlockAt);
        uint256 amount = habit.stake;
        habit.claimed = true;
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        if (!success) revert RefundTransferFailed();
        emit RefundClaimed(msg.sender, habit.id, amount);
    }

    /// @notice Read a snapshot with the exact chain time used to calculate status.
    /// @dev nextCheckInAt/deadline describe the NEXT REQUIRED window. After its
    ///      check-in, the frontend must wait for the following window to open.
    function getHabit(address user) external view returns (
        Habit memory habit,
        Status status,
        uint256 nextCheckInAt,
        uint256 deadline,
        uint256 unlockAt,
        uint256 chainTimestamp
    ) {
        habit = _habits[user];
        status = _status(habit);
        chainTimestamp = block.timestamp;
        if (habit.stake == 0) return (habit, status, 0, 0, 0, chainTimestamp);
        unlockAt = uint256(habit.startedAt) + uint256(habit.totalDays) * DAY;
        if (status == Status.Active || status == Status.Failed) {
            nextCheckInAt = uint256(habit.startedAt) + uint256(habit.completedDays) * DAY;
            deadline = nextCheckInAt + DAY;
        }
    }

    /// @notice Total forfeited principal for this account, including its latest
    ///         failed habit even before that habit has been replaced.
    function permanentlyLocked(address user) external view returns (uint256) {
        Habit memory habit = _habits[user];
        return forfeitedStake[user] + (_status(habit) == Status.Failed ? habit.stake : 0);
    }

    function _status(Habit memory habit) private view returns (Status) {
        if (habit.stake == 0) return Status.None;
        if (habit.claimed) return Status.Claimed;
        if (habit.completedDays == habit.totalDays) return Status.Completed;
        uint256 firstMissingDeadline = uint256(habit.startedAt) + (uint256(habit.completedDays) + 1) * DAY;
        if (block.timestamp >= firstMissingDeadline) return Status.Failed;
        return Status.Active;
    }

    /// @dev Direct transfers are rejected; only createHabit accepts native BOT.
    receive() external payable { revert DirectTransfersDisabled(); }
    fallback() external payable { revert DirectTransfersDisabled(); }
}
