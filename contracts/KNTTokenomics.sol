// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library KNTTokenomics {
    uint256 internal constant BASIS_POINTS = 10_000;
    uint256 internal constant TOKEN_DECIMALS = 18;

    uint256 internal constant TOTAL_SUPPLY = 210_000_000 ether;

    uint256 internal constant INITIAL_LABUBU_USDT_VALUE = 600_000 ether;
    uint256 internal constant INITIAL_KNT_AMOUNT = 200_000 ether;
    uint256 internal constant INITIAL_PRICE_USDT = 3 ether;

    uint256 internal constant BASE_DAILY_EMISSION = 1_560 ether;
    uint256 internal constant MAX_DAILY_EMISSION = 3_360 ether;
    uint256 internal constant EMISSION_STEP_PER_10K_LP = 100 ether;
    uint256 internal constant LP_PER_EMISSION_STEP_USDT = 10_000 ether;

    uint256 internal constant STATIC_SHARE_BP = 5_000;
    uint256 internal constant DYNAMIC_SHARE_BP = 4_000;
    uint256 internal constant NODE_SHARE_BP = 1_000;

    uint256 internal constant POWER_PER_USDT = 6;
    uint256 internal constant POWER_COMPOUND_BP_PER_DAY = 120; // 1.2%

    uint256 internal constant REDUCTION_PERIOD = 50 days;
    uint256 internal constant REDUCTION_BP = 2_000;
    uint256 internal constant MAX_REDUCTION_ROUNDS = 10;

    uint256 internal constant NODE_SELF_LP_USDT = 1_000 ether;
    uint256 internal constant NODE_DIRECT_LP_USDT = 3_000 ether;
    uint256 internal constant EFFECTIVE_DIRECT_LP_USDT = 100 ether;

    uint256 internal constant DIRECT_LEVEL_ONE_BP = 2_000;
    uint256 internal constant DYNAMIC_LEVEL_2_TO_10_BP = 500;
    uint256 internal constant DYNAMIC_LEVEL_11_TO_15_BP = 300;
    uint256 internal constant MAX_DYNAMIC_LEVEL = 15;

    uint256 internal constant BUY_TAX_BP = 0;
    uint256 internal constant SELL_TAX_BP = 500;
    uint256 internal constant SELL_TAX_QUEUE_BP = 200;
    uint256 internal constant SELL_TAX_FOUNDATION_BP = 300;

    uint256 internal constant PROFIT_TAX_BP = 3_000;
    uint256 internal constant PROFIT_TAX_QUEUE_BP = 500;
    uint256 internal constant PROFIT_TAX_BURN_BP = 1_000;
    uint256 internal constant PROFIT_TAX_FOUNDATION_BP = 1_500;

    uint256 internal constant DUMP_DROP_10_BP = 1_000;
    uint256 internal constant DUMP_DROP_20_BP = 2_000;
    uint256 internal constant DUMP_TAX_10_BP = 1_000;
    uint256 internal constant DUMP_TAX_20_BP = 2_000;

    uint256 internal constant BURN_QUEUE_REWARD_BP = 12_000;

    uint256 internal constant MIGRATION_RELEASE_BP = 10; // 0.1% daily
    uint256 internal constant MIGRATION_BOOST_RELEASE_BP = 30; // 0.3% daily
}
