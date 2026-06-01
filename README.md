# Finnexa Finance & Budget Planner

A comprehensive, private financial planning tool designed to provide a deep-dive analysis of your current finances and future retirement goals. This application focuses on UK-specific tax logic and sophisticated projections to help you make informed financial decisions.

## Key Features

### 1. Advanced Income & Tax Estimation
*   **Multi-Source Income:** Support for PAYE salaries and Self-Employment profits.
*   **UK Tax Logic:** Automatically calculates Income Tax and National Insurance based on current UK rates (including Scottish tax bands).
*   **Savings Interest Tax:** Sophisticated tracking of non-ISA savings interest, including the dynamic **Personal Savings Allowance (£1,000 / £500 / £0)** based on your tax bracket.
*   **SIPP Optimization:** Proactive advice on SIPP (Self-Invested Personal Pension) contributions to:
    *   Stay within the 20% Basic Rate tax band.
    *   Retain the full £1,000 Personal Savings Allowance.
    *   Avoid the effective 60% tax rate "cliff" between £100k and £125k by restoring your Personal Allowance.

### 2. Budgeting & Spending Breakdown
*   **Granular Categorization:** Track expenses across categories like Housing, Food, Entertainment, Debt, and Professional costs.
*   **Visual Spending Chart:** An interactive SVG donut chart providing an immediate visual breakdown of your monthly outflow.
*   **Annual Bill Provisioning:** Input annual costs (like car insurance) to see the monthly set-aside required.

### 3. Savings & Growth Projections
*   **Bucket-Based Tracking:** Manage multiple savings pots (ISA, LISA, Cash, Pensions).
*   **Future Growth:** Project the growth of your savings over 10-50 years with custom annual interest rates.
*   **Smart Diversion Logic:** Handles complex contribution rules, such as diverting LISA contributions to an ISA or Cash bucket once the age 50 limit is reached.
*   **Inflation Adjustment:** All projections can be viewed in "Today's Money" by factoring in a customizable inflation rate.

### 4. Wealth Tracking (New)
*   **Explicit Capital Tracking:** Set your "Total Contributed" amount for each savings bucket to accurately distinguish between your capital investment and total growth.
*   **Visual Wealth Composition:** Instant pie-chart breakdown of your total wealth: **Contributed Capital** vs. **Other (Growth/Bonus)**.
*   **Liquidity Insights:** Visualize your wealth's availability via a second pie chart showing **Accessible** (e.g., ISA, Cash) vs. **Locked** (e.g., Pension, LISA) funds based on your current age.

### 5. Mortgage & Debt Analysis
*   **Payoff Tracking:** Calculate exactly when your mortgage will be cleared based on your current rate and term.
*   **Overpayment Impact:** See how monthly or one-off overpayments reduce your total interest and shave years off your mortgage term.
*   **Retirement Alignment:** Automatically flags whether your mortgage will be paid off before your target retirement age.

### 5. Retirement Planning
*   **Income Gap Analysis:** Calculates the "Gross Earnings Needed" to sustain your current lifestyle in retirement.
*   **Drawdown Strategy:** Plan how to withdraw from various pots (Pensions vs ISAs) to maximize tax efficiency.
*   **Defined Benefit Support:** Includes specific calculations for NHS, Civil Service, and Teachers' pension schemes.
*   **Shortfall Indicators:** Real-time feedback on whether your current savings rate is sufficient to cover your projected retirement expenses.

## Technical Details
*   **Privacy First:** All data is processed locally (or within your private Firebase instance). No financial data is shared with third parties.
*   **Built With:** React (TypeScript), Vite, and Vanilla CSS for a lightweight, "paper-and-ink" aesthetic.
*   **Responsive Design:** Optimized for both desktop deep-dives and mobile quick-checks.

---
*Disclaimer: This application provides financial ESTIMATES based on the data provided. It should not be used as a substitute for professional financial advice.*
