// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// TEST FIXTURE ONLY: never deploy as the production HabitStake application.
interface IHabitStake {
    function createHabit(uint256 days_, uint256 stakeAmount) external payable returns (uint64);
    function checkIn() external;
    function claimRefund() external;
}

contract RefundReceiver {
    IHabitStake public immutable target;
    bool public rejectRefund;
    bool public attack;
    bool public nestedAttempted;
    bool public nestedSucceeded;

    constructor(address target_) { target = IHabitStake(target_); }
    function configure(bool reject_, bool attack_) external { rejectRefund = reject_; attack = attack_; }
    function create(uint256 days_) external payable { target.createHabit{value: msg.value}(days_, msg.value); }
    function checkIn() external { target.checkIn(); }
    function claim() external { target.claimRefund(); }
    receive() external payable {
        require(!rejectRefund, 'receiver rejected');
        if (attack) {
            nestedAttempted = true;
            try target.claimRefund() { nestedSucceeded = true; } catch { }
        }
    }
}
