export type Region = "england-wales-ni" | "scotland";

export type PayeIncome = {
  id: string;
  label: string;
  gross: number;
  pensionRate: number;
  employerPensionContribution: number;
  pensionType?: "standard" | "nhs" | "civil-service" | "teachers" | "police" | "firefighters" | "armed-forces" | "lgps";
};

export type ExpenseLine = {
  id: string;
  label: string;
  amount: number;
  includeInRetirement?: boolean;
  startAge?: number;
  isInflationLinked?: boolean;
  bucket: "living" | "housing" | "debt" | "saving" | "tax" | "food" | "entertainment" | "professional";
};

export type SelfEmployment = {
  id: string;
  label: string;
  gross: number;
  expenses: ExpenseLine[];
  isNiLiable?: boolean;
};

export type BudgetLine = ExpenseLine & {
  bucket: "living" | "housing" | "debt" | "saving" | "tax" | "food" | "entertainment" | "professional";
};

export type SavingsBucket = {
  id: string;
  label: string;
  balance: number;
  monthly: number;
  annualRate: number;
  type: "cash" | "isa" | "pension" | "lisa" | "workplace-private-pension" | "nhs-pension" | "civil-service-pension" | "teachers-pension" | "police-pension" | "firefighters-pension" | "armed-forces-pension" | "lgps-pension";
  isHidden?: boolean;
  stopContributingAge?: number;
  startWithdrawalAge?: number;
  dbSalary?: number;
  dbYearsService?: number;
  dbScheme?: string;
  nhsSalary?: number;
  nhsYearsService?: number;
  nhsScheme?: "1995" | "2008" | "2015";
  lastUpdated?: string;
  totalContributed?: number;
};

export type MortgageInputs = {
  amount: number;
  annualRate: number;
  years: number;
  monthlyOverpayment: number;
  oneOffMonth: number;
  oneOffAmount: number;
  lastUpdated?: string;
  /** Day of month the payment leaves the account, 1–28. Defaults to 1 if not set. */
  paymentDay?: number;
};

export type TaxSettings = {
  taxCode: string;
  region: Region;
  sippNetContribution: number;
  includeStudentLoan?: boolean;
  pensionRate?: number;
};

export const money = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

export const monthlyMoney = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

const roundPounds = (value: number) => Math.round(value);

export function clampNumber(value: number, min = 0) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, value);
}

export function calculateCurrentBucketValue(bucket: SavingsBucket): {
  currentValue: number;
  contributed: number;
  other: number;
} {
  const currentValue = bucket.balance;
  const contributed = bucket.totalContributed || bucket.balance;
  const other = Math.max(0, currentValue - contributed);
  
  return {
    currentValue,
    contributed,
    other,
  };
}

export function isBucketAccessible(bucket: { type: string; startWithdrawalAge?: number }, currentAge: number): boolean {
  const type = bucket.type.toLowerCase();
  
  if (type === 'lisa') {
    return currentAge >= 60;
  }
  if (type === 'pension' || type === 'workplace-pension' || type === 'workplace-private-pension' || type.includes('pension')) {
    const age = bucket.startWithdrawalAge || 57; // Default pension age
    return currentAge >= age;
  }
  
  return true; // Cash/ISA are always accessible
}

export function parseTaxCodeAllowance(code: string) {
  const normalized = code.trim().toUpperCase();
  const match = normalized.match(/^([K]?)(\d+)/);
  if (!match) return 12570;
  const allowance = Number(match[2]) * 10;
  return match[1] === "K" ? -allowance : allowance;
}

export function totalPayeGross(incomes: PayeIncome[]) {
  return incomes.reduce((sum, income) => sum + clampNumber(income.gross), 0);
}

export function totalPayeTaxable(incomes: PayeIncome[]) {
  return incomes.reduce((sum, income) => {
    const gross = clampNumber(income.gross);
    const percentagePension = gross * (clampNumber(income.pensionRate) / 100);
    return sum + Math.max(0, gross - percentagePension);
  }, 0);
}

export function employmentPension(incomes: PayeIncome[]) {
  return incomes.reduce(
    (sum, income) => sum + clampNumber(income.gross) * (clampNumber(income.pensionRate) / 100),
    0,
  );
}

export function employerPensionContributions(incomes: PayeIncome[]) {
  return incomes.reduce(
    (sum, income) => sum + (clampNumber(income.gross) * (clampNumber(income.employerPensionContribution) / 100)),
    0,
  );
}

export function selfEmploymentProfit(streams: SelfEmployment[]) {
  return streams.reduce((sum, stream) => {
    const expenses = stream.expenses.reduce((expenseSum, expense) => expenseSum + clampNumber(expense.amount), 0);
    return sum + Math.max(0, clampNumber(stream.gross) - expenses);
  }, 0);
}

export function grossSippFromNet(netContribution: number) {
  return clampNumber(netContribution) * 1.25;
}

export function personalAllowance(adjustedNetIncome: number, taxCode: string) {
  const baseAllowance = parseTaxCodeAllowance(taxCode);
  if (baseAllowance <= 0) return baseAllowance;
  const taper = Math.max(0, (adjustedNetIncome - 100000) / 2);
  return Math.max(0, baseAllowance - taper);
}

export function calculateNhsEmployeeRate(gross: number) {
  const annual = clampNumber(gross);
  if (annual <= 13259) return 5.2;
  if (annual <= 27797) return 6.5;
  if (annual <= 33868) return 8.3;
  if (annual <= 50845) return 9.8;
  if (annual <= 65190) return 10.7;
  return 12.5;
}

export function calculateCivilServiceEmployeeRate(gross: number) {
  const annual = clampNumber(gross);
  if (annual <= 34799) return 4.60;
  if (annual <= 56000) return 5.45;
  if (annual <= 150000) return 7.35;
  return 8.05;
}

export function calculateTeachersEmployeeRate(gross: number) {
  const annual = clampNumber(gross);
  if (annual <= 34872.99) return 7.4;
  if (annual <= 46943.99) return 8.9;
  if (annual <= 55660.99) return 9.9;
  if (annual <= 73768.99) return 10.5;
  if (annual <= 100590.99) return 11.6;
  return 12.0;
}

export function calculatePoliceEmployeeRate(gross: number) {
  const annual = clampNumber(gross);
  if (annual <= 27000) return 12.44;
  if (annual <= 60000) return 13.44;
  return 13.78;
}

export function calculateFirefightersEmployeeRate(gross: number) {
  const annual = clampNumber(gross);
  if (annual <= 27818) return 11.0;
  if (annual <= 51515) return 12.9;
  if (annual <= 142500) return 13.5;
  return 14.5;
}

export function calculateLgpsEmployeeRate(gross: number) {
  const annual = clampNumber(gross);
  if (annual <= 17800) return 5.5;
  if (annual <= 28000) return 5.8;
  if (annual <= 45600) return 6.5;
  if (annual <= 57700) return 6.8;
  if (annual <= 81000) return 8.5;
  if (annual <= 114800) return 9.9;
  if (annual <= 135300) return 10.5;
  if (annual <= 203000) return 11.4;
  return 12.5;
}

export const NHS_EMPLOYER_RATE = 23.7;

export function calculateIncomeTax(
  taxableIncomeBeforeAllowance: number,
  taxCode: string,
  grossReliefAtSourcePension = 0,
  region: Region = "england-wales-ni",
  interestIncome = 0,
) {
  const adjustedNetIncome = Math.max(0, taxableIncomeBeforeAllowance + interestIncome - grossReliefAtSourcePension);
  const allowance = personalAllowance(adjustedNetIncome, taxCode);
  const taxableAfterAllowance = Math.max(0, taxableIncomeBeforeAllowance - allowance);
  const basicExtension = grossReliefAtSourcePension;

  const bands =
    region === "scotland"
      ? [
          { label: "Starter", limit: 3967, rate: 0.19 },
          { label: "Basic", limit: 16956, rate: 0.2 },
          { label: "Intermediate", limit: 31092, rate: 0.21 },
          { label: "Higher", limit: 62430, rate: 0.42 },
          { label: "Advanced", limit: 125140, rate: 0.45 },
          { label: "Top", limit: Infinity, rate: 0.48 },
        ]
      : [
          { label: "Basic", limit: 37700 + basicExtension, rate: 0.2 },
          { label: "Higher", limit: 125140 - 12570 + basicExtension, rate: 0.4 },
          { label: "Additional", limit: Infinity, rate: 0.45 },
        ];

  let remaining = taxableAfterAllowance;
  let previousLimit = 0;
  let totalTax = 0;
  const bandResults = bands.map((band) => {
    const width = band.limit === Infinity ? Infinity : Math.max(0, band.limit - previousLimit);
    const taxable = Math.max(0, Math.min(remaining, width));
    const tax = taxable * band.rate;
    totalTax += tax;
    remaining -= taxable;
    previousLimit = band.limit;
    return { ...band, taxable, tax };
  });

  // Calculate highest marginal rate for PSA
  // For PSA, we look at the band results and see if any higher/additional rate was hit
  const isHigherRate = bandResults.some(b => (b.label === "Higher" || b.label === "Advanced" || b.label === "Top") && b.taxable > 0);
  const isAdditionalRate = bandResults.some(b => (b.label === "Additional" || b.label === "Top") && b.taxable > 0);
  
  const psaAllowance = isAdditionalRate ? 0 : (isHigherRate ? 500 : 1000);
  const taxableInterest = Math.max(0, interestIncome - psaAllowance);
  
  // Tax on interest is at the marginal rate(s)
  // Simplified: we add interest on top of existing taxable income
  let remainingInterest = taxableInterest;
  let interestTax = 0;
  
  // Re-calculate bands with interest to find interest tax
  let totalWithInterest = taxableAfterAllowance + taxableInterest;
  let remainingTotal = totalWithInterest;
  let previousLimitInt = 0;
  let totalTaxWithInterest = 0;
  
  bands.forEach((band) => {
    const width = band.limit === Infinity ? Infinity : Math.max(0, band.limit - previousLimitInt);
    const taxable = Math.max(0, Math.min(remainingTotal, width));
    const tax = taxable * band.rate;
    totalTaxWithInterest += tax;
    remainingTotal -= taxable;
    previousLimitInt = band.limit;
  });

  interestTax = totalTaxWithInterest - totalTax;

  return {
    adjustedNetIncome,
    allowance,
    taxableAfterAllowance,
    totalTax: totalTax + interestTax,
    incomeTaxOnly: totalTax,
    interestTax,
    psaAllowance,
    taxableInterest,
    isHigherRate,
    isAdditionalRate,
    bandResults,
  };
}

export function calculateNationalInsurance(taxableIncome: number, type: "class1" | "class4") {
  const amount = Math.max(0, taxableIncome);
  
  // 2024/25 Rates (Standard for 2026 unless updated)
  const primaryThreshold = 12570;
  const upperLimit = 50270;
  
  const mainRate = type === "class1" ? 0.08 : 0.06; // 8% for PAYE, 6% for Self-Employed
  const higherRate = 0.02;

  let totalNi = 0;

  if (amount > primaryThreshold) {
    const mainBandAmount = Math.min(amount, upperLimit) - primaryThreshold;
    totalNi += mainBandAmount * mainRate;
  }

  if (amount > upperLimit) {
    const higherBandAmount = amount - upperLimit;
    totalNi += higherBandAmount * higherRate;
  }

  return totalNi;
}

export function calculateTaxSummary(incomes: PayeIncome[], streams: SelfEmployment[], savings: SavingsBucket[], settings: TaxSettings) {
  const payeTaxable = totalPayeTaxable(incomes);
  const payeGross = totalPayeGross(incomes);
  
  // Self employment profit
  const selfProfit = selfEmploymentProfit(streams);
  const niLiableSelfProfit = streams.reduce((sum, stream) => {
    if (!stream.isNiLiable) return sum;
    const expenses = stream.expenses.reduce((expenseSum, expense) => expenseSum + clampNumber(expense.amount), 0);
    return sum + Math.max(0, clampNumber(stream.gross) - expenses);
  }, 0);

  // Savings interest (from non-ISA buckets)
  const annualSavingsInterest = savings
    .filter(s => s.type === "cash")
    .reduce((sum, s) => sum + (clampNumber(s.balance) * (clampNumber(s.annualRate) / 100)), 0);

  const grossReliefAtSourcePension = grossSippFromNet(settings.sippNetContribution);
  const combinedTaxable = payeTaxable + selfProfit;
  const combinedTax = calculateIncomeTax(
    combinedTaxable,
    settings.taxCode,
    grossReliefAtSourcePension,
    settings.region,
    annualSavingsInterest
  );
  
  const payeOnlyTax = calculateIncomeTax(payeTaxable, settings.taxCode, 0, settings.region);
  const enteredTaxPaid = 0;
  const assumedPayeTaxPaid = payeOnlyTax.totalTax;
  const selfAssessmentDue = Math.max(0, combinedTax.totalTax - assumedPayeTaxPaid);
  
  // National Insurance
  const payeNi = incomes.reduce((sum, income) => sum + calculateNationalInsurance(clampNumber(income.gross), "class1"), 0);
  const selfNi = calculateNationalInsurance(niLiableSelfProfit, "class4");
  const totalNi = payeNi + selfNi;

  // Student Loan
  let studentLoanTotal = 0;
  if (settings.includeStudentLoan) {
    const threshold = 27295; // Plan 2 threshold for 2024/25
    const totalIncomeForStudentLoan = payeGross + selfProfit;
    studentLoanTotal = Math.max(0, (totalIncomeForStudentLoan - threshold) * 0.09);
  }

  const employmentPensionTotal = employmentPension(incomes);
  const employerPensionTotal = employerPensionContributions(incomes);
  
  const selfTaxTotal = selfAssessmentDue + selfNi;
  const netAnnual = payeGross - employmentPensionTotal - assumedPayeTaxPaid - payeNi + selfProfit - selfTaxTotal + annualSavingsInterest - combinedTax.interestTax - studentLoanTotal;
  const cashAnnual = payeGross - employmentPensionTotal - assumedPayeTaxPaid - payeNi + selfProfit - studentLoanTotal;
  
  // SIPP Optimization Logic
  const adjustedNet = combinedTax.adjustedNetIncome;
  
  // 1. £100k Taper Recommendation
  const sippGrossNeededToReach100k = Math.max(0, adjustedNet - 100000);
  const sippNetNeededToReach100k = sippGrossNeededToReach100k * 0.8;

  // 2. 40% Threshold Recommendation (to keep £1000 PSA)
  const sippGrossToStayBasic = Math.max(0, adjustedNet - (37700 + 12570));
  const sippNetToStayBasic = sippGrossToStayBasic * 0.8;

  return {
    payeGross,
    payeTaxable,
    selfProfit,
    annualSavingsInterest,
    niLiableSelfProfit,
    combinedTaxable,
    grossReliefAtSourcePension,
    payeOnlyTax,
    combinedTax,
    assumedPayeTaxPaid,
    selfAssessmentDue,
    selfNi,
    selfTaxTotal,
    totalNi,
    studentLoanTotal,
    sippGrossNeededToReach100k,
    sippNetNeededToReach100k,
    sippGrossToStayBasic,
    sippNetToStayBasic,
    employmentPensionTotal,
    employerPensionTotal,
    netAnnual,
    monthlyNet: netAnnual / 12,
    cashAnnual,
    cashMonthlyNet: cashAnnual / 12,
    isHigherRate: combinedTax.isHigherRate,
    psaAllowance: combinedTax.psaAllowance,
    interestTax: combinedTax.interestTax,
  };
}

export function budgetSummary(
  monthlyNet: number,
  lines: BudgetLine[],
  annualBills: ExpenseLine[] = [],
  savings: SavingsBucket[] = [],
  mortgageOverpayment: number = 0
) {
  const totals = lines.reduce<Record<BudgetLine["bucket"], number>>(
    (acc, line) => {
      acc[line.bucket] += clampNumber(line.amount);
      return acc;
    },
    { living: 0, housing: 0, debt: 0, saving: 0, tax: 0, food: 0, entertainment: 0, professional: 0 },
  );
  const annualBillsMonthly = annualBills.reduce((sum, bill) => sum + clampNumber(bill.amount) / 12, 0);
  const monthlySavings = savings.reduce((sum, bucket) => sum + clampNumber(bucket.monthly), 0) + clampNumber(mortgageOverpayment) + totals["saving"];
  const monthlyExpenses = totals["living"] + totals["housing"] + totals["debt"] + totals["tax"] + totals["food"] + totals["entertainment"] + totals["professional"] + annualBillsMonthly;
  const monthlyOut = monthlyExpenses + monthlySavings;
  return {
    totals,
    annualBillsMonthly,
    monthlyExpenses,
    monthlySavings,
    monthlyOut,
    monthlySurplus: monthlyNet - monthlyOut,
    annualSurplus: (monthlyNet - monthlyOut) * 12,
  };
}

export function futureValue(balance: number, monthly: number, annualRate: number, years: number) {
  const months = Math.max(0, Math.round(years * 12));
  const monthlyRate = clampNumber(annualRate) / 100 / 12;
  let value = clampNumber(balance);
  for (let i = 0; i < months; i += 1) {
    value = value * (1 + monthlyRate) + clampNumber(monthly);
  }
  return value;
}

export function projectSavings(buckets: SavingsBucket[], years: number, birthYear: number, drawdownSettings: Record<string, any> = {}, inflationRate: number = 3) {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const startAge = (currentYear - birthYear) + (currentMonth / 12); // Approximate current age
  const months = Math.max(0, Math.round(years * 12));
  
  const bucketStates = buckets.map(b => ({
    ...b,
    currentBalance: clampNumber(b.balance),
    totalContributed: clampNumber(b.balance),
    withdrawnValue: 0,
    isWithdrawn: false
  }));

  for (let m = 0; m < months; m++) {
    const ageAtMonth = startAge + (m / 12);
    let divertedLisaAmount = 0;

    // 1. Determine contributions for this month
    const monthlyContributions = bucketStates.map(b => {
      if (b.isWithdrawn) return 0;

      const settings = drawdownSettings[b.id] || {};
      const effectiveWithdrawAge = settings.useWithdrawAge ? settings.withdrawAge : b.startWithdrawalAge;
      const effectiveStopAge = settings.useStopAge ? settings.stopAge : b.stopContributingAge;

      // If withdrawal age reached, stop contributions
      if (effectiveWithdrawAge && ageAtMonth >= effectiveWithdrawAge) {
        return 0;
      }

      let contrib = clampNumber(b.monthly);

      // Check for manual contribution stop age
      if (effectiveStopAge && ageAtMonth >= effectiveStopAge) {
        contrib = 0;
      }

      // LISA logic
      if (b.type === 'lisa') {
        if (ageAtMonth < 50) {
          return contrib * 1.25;
        } else {
          divertedLisaAmount += contrib;
          return 0;
        }
      }
      return contrib;
    });

    // 2. Diversion logic (LISA -> ISA -> Cash)
    if (divertedLisaAmount > 0) {
      const isaIdx = bucketStates.findIndex(b => b.type === 'isa' && !b.isWithdrawn);
      if (isaIdx !== -1) {
        const currentIsaMonthly = bucketStates[isaIdx].monthly;
        const availableRoom = Math.max(0, 1666.67 - currentIsaMonthly);
        const amountToDivert = Math.min(divertedLisaAmount, availableRoom);
        monthlyContributions[isaIdx] += amountToDivert;
        divertedLisaAmount -= amountToDivert;
      }
      if (divertedLisaAmount > 0) {
        const cashIdx = bucketStates.findIndex(b => b.type === 'cash' && !b.isWithdrawn);
        if (cashIdx !== -1) {
          monthlyContributions[cashIdx] += divertedLisaAmount;
        }
      }
    }

    // 3. Apply growth and update balances
    bucketStates.forEach((b, idx) => {
      const settings = drawdownSettings[b.id] || { rate: 0, withdrawAge: b.startWithdrawalAge || 67 };
      const effectiveWithdrawAge = settings.withdrawAge || b.startWithdrawalAge || 67;
      const effectiveStopAge = settings.useStopAge ? settings.stopAge : b.stopContributingAge;

      const isWithdrawing = (settings.rate > 0) && effectiveWithdrawAge && ageAtMonth >= effectiveWithdrawAge;
      const hasStopped = (effectiveStopAge && ageAtMonth >= effectiveStopAge) || isWithdrawing;
      
      // Growth logic:
      // If we are currently in a withdrawal phase, use inflationRate as a proxy for 'real growth' 
      // of the pot during drawdown, otherwise use the bucket's own annualRate.
      const annualGrowthRate = isWithdrawing ? inflationRate : clampNumber(b.annualRate);
      const monthlyRate = annualGrowthRate / 100 / 12;
      
      if (isWithdrawing) {
        // Pot is in drawdown
        if (b.currentBalance > 0) {
          b.isWithdrawn = true; // Mark as started withdrawal
          const rate = settings.rate ?? 4;
          const annualDrawdownAmount = b.currentBalance * (rate / 100);
          const monthlyDrawdown = annualDrawdownAmount / 12;
          
          // Growth then withdrawal
          b.currentBalance = (b.currentBalance * (1 + monthlyRate)) - monthlyDrawdown;
          if (b.currentBalance < 0) b.currentBalance = 0;
        }
      } else {
        // Normal accumulation
        const contrib = monthlyContributions[idx];
        b.currentBalance = (b.currentBalance * (1 + monthlyRate)) + contrib;
        b.totalContributed += contrib;
      }
    });
  }

  return bucketStates.map(b => ({
    ...b,
    // 'projected' is the balance at the end of the projectionYears
    projected: b.currentBalance,
    finalBalance: b.currentBalance,
    contributed: b.totalContributed,
  }));
}

export function monthlyMortgagePayment(amount: number, annualRate: number, years: number) {
  const principal = clampNumber(amount);
  const months = Math.max(1, Math.round(clampNumber(years) * 12));
  const monthlyRate = clampNumber(annualRate) / 100 / 12;
  if (monthlyRate === 0) return principal / months;
  return (principal * monthlyRate) / (1 - (1 + monthlyRate) ** -months);
}

export function calculateMortgage(inputs: MortgageInputs) {
  const standardPayment = monthlyMortgagePayment(inputs.amount, inputs.annualRate, inputs.years);
  const monthlyRate = clampNumber(inputs.annualRate) / 100 / 12;
  const rows = [];
  let balance = clampNumber(inputs.amount);
  let cumulativeInterest = 0;
  let month = 1;

  while (balance > 0.5 && month <= 600) {
    const interest = balance * monthlyRate;
    const capital = Math.min(balance, standardPayment - interest);
    const extra = Math.min(
      balance - capital,
      clampNumber(inputs.monthlyOverpayment) +
        (month === Math.round(inputs.oneOffMonth) ? clampNumber(inputs.oneOffAmount) : 0),
    );
    const endingBalance = Math.max(0, balance + interest - standardPayment - extra);
    cumulativeInterest += interest;
    rows.push({
      month,
      startingBalance: balance,
      payment: standardPayment,
      interest,
      capital,
      extra,
      endingBalance,
      cumulativeInterest,
    });
    balance = endingBalance;
    month += 1;
  }

  const noOverpaymentInterest = calculateInterestWithoutOverpayments(inputs.amount, inputs.annualRate, inputs.years);
  return {
    standardPayment,
    payoffMonths: rows.length,
    payoffYears: rows.length / 12,
    totalInterest: cumulativeInterest,
    interestSaved: Math.max(0, noOverpaymentInterest - cumulativeInterest),
    rows,
  };
}

function calculateInterestWithoutOverpayments(amount: number, annualRate: number, years: number) {
  const payment = monthlyMortgagePayment(amount, annualRate, years);
  const monthlyRate = clampNumber(annualRate) / 100 / 12;
  let balance = clampNumber(amount);
  let interestTotal = 0;
  const months = Math.max(1, Math.round(clampNumber(years) * 12));
  for (let month = 1; month <= months; month += 1) {
    const interest = balance * monthlyRate;
    interestTotal += interest;
    balance = Math.max(0, balance + interest - payment);
  }
  return interestTotal;
}

export function calculateMortgageUpdate(mortgage: MortgageInputs, today: Date = new Date()) {
  if (!mortgage.lastUpdated) return { newBalance: mortgage.amount, interestAccrued: 0, paymentsMade: 0, monthsElapsed: 0 };

  // paymentDay is the day-of-month the direct debit leaves (e.g. 5).
  // Clamp to 1–28 to avoid issues with short months.
  const paymentDay = Math.min(28, Math.max(1, Math.round(mortgage.paymentDay ?? 1)));

  const lastUpdate = new Date(mortgage.lastUpdated);

  // Walk forward month-by-month from lastUpdated, counting every payment date
  // that has already passed (i.e. is on or before today).
  let monthsElapsed = 0;
  // Start from the month after lastUpdated and check if its payment date has passed.
  // We use year/month arithmetic to avoid DST / day-overflow issues.
  let checkYear = lastUpdate.getFullYear();
  let checkMonth = lastUpdate.getMonth(); // 0-indexed

  // Move to the next calendar month's payment date
  checkMonth += 1;
  if (checkMonth > 11) { checkMonth = 0; checkYear += 1; }

  // Safety cap: never check more than 600 months ahead
  for (let guard = 0; guard < 600; guard++) {
    const paymentDate = new Date(checkYear, checkMonth, paymentDay);
    if (paymentDate > today) break;
    monthsElapsed += 1;
    checkMonth += 1;
    if (checkMonth > 11) { checkMonth = 0; checkYear += 1; }
  }

  if (monthsElapsed <= 0) return { newBalance: mortgage.amount, interestAccrued: 0, paymentsMade: 0, monthsElapsed: 0 };

  const standardPayment = monthlyMortgagePayment(mortgage.amount, mortgage.annualRate, mortgage.years);
  const monthlyRate = clampNumber(mortgage.annualRate) / 100 / 12;
  let balance = mortgage.amount;
  let interestAccrued = 0;
  let paymentsMade = 0;

  for (let i = 0; i < monthsElapsed; i++) {
    const monthIndex = i + 1; // 1-based index for comparison with oneOffMonth
    const interest = balance * monthlyRate;
    const extra = (monthIndex === Math.round(mortgage.oneOffMonth)) ? clampNumber(mortgage.oneOffAmount) : 0;
    const payment = Math.min(balance + interest, standardPayment + clampNumber(mortgage.monthlyOverpayment) + extra);
    interestAccrued += interest;
    paymentsMade += payment;
    balance = Math.max(0, balance + interest - payment);
    if (balance === 0) break;
  }

  return { newBalance: balance, interestAccrued, paymentsMade, monthsElapsed };
}

export function calculatePVBridge(annualExpenses: number, realGrowthRate: number, bridgeYears: number): number {
  if (bridgeYears <= 0) return 0;
  const growthFactor = 1 + (realGrowthRate / 100);
  let pv = 0;
  for (let i = 0; i < bridgeYears; i++) {
pv += annualExpenses / Math.pow(growthFactor, i);
  }
  return pv;
}

export function solveGrossPensionWithdrawal(
  netTarget: number,
  passiveIncome: number,
  pensionTaxableFraction: number,
  taxCode: string,
  region: Region
): { grossPension: number; tax: number } {
  if (netTarget <= 0) {
    const tax = calculateIncomeTax(passiveIncome, taxCode, 0, region).totalTax;
    return { grossPension: 0, tax };
  }

  let low = 0;
  let high = Math.max(1000000, netTarget * 5);
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    const taxableIncome = passiveIncome + pensionTaxableFraction * mid;
    const tax = calculateIncomeTax(taxableIncome, taxCode, 0, region).totalTax;
    const netValue = mid + passiveIncome - tax;
    
    if (netValue < (netTarget + passiveIncome)) {
      low = mid;
    } else {
      high = mid;
    }
  }
  
  const grossPension = high;
  const finalTaxable = passiveIncome + pensionTaxableFraction * grossPension;
  const tax = calculateIncomeTax(finalTaxable, taxCode, 0, region).totalTax;
  
  return { grossPension, tax };
}

export type AnnualContributionSchedule = (age: number) => {
  accessible: number;
  locked: number;
};

function annualContributionsForAge(
  age: number,
  annualAccessibleContribution: number,
  annualLockedContribution: number,
  contributionSchedule?: AnnualContributionSchedule
) {
  if (!contributionSchedule) {
    return {
      accessible: annualAccessibleContribution,
      locked: annualLockedContribution,
    };
  }

  const scheduled = contributionSchedule(age);
  return {
    accessible: Math.max(0, clampNumber(scheduled.accessible)),
    locked: Math.max(0, clampNumber(scheduled.locked)),
  };
}

export function calculateCoastFire(
  currentAge: number,
  retirementAge: number,
  pensionAccessAge: number,
  currentAccessibleBalance: number,
  currentLockedBalance: number,
  annualExpenses: number,
  realGrowthRate: number,
  swr: number = 4,
  annualAccessibleContribution: number = 0,
  annualLockedContribution: number = 0,
  passiveIncome: number = 0,
  taxCode: string = "1257L",
  region: Region = "england-wales-ni",
  pensionTaxMethod: 'ufpls' | 'lump-sum' = 'ufpls',
  contributionSchedule?: AnnualContributionSchedule
): CoastFireResult {
  const taxOnPassive = calculateIncomeTax(passiveIncome, taxCode, 0, region).totalTax;
  const netPassive = Math.max(0, passiveIncome - taxOnPassive);
  const netBridgeExpense = Math.max(0, annualExpenses - netPassive);
  const growthFactor = 1 + (realGrowthRate / 100);
  const bridgeYears = Math.max(0, pensionAccessAge - retirementAge);
  const bridgeCostAtRetirement = calculatePVBridge(netBridgeExpense, realGrowthRate, bridgeYears);
  
  const solved = solveGrossPensionWithdrawal(annualExpenses - passiveIncome, passiveIncome, 0.75, taxCode, region);
  const targetPot = solved.grossPension / (swr / 100);
  
  function checkStatus(acc: number, lock: number, age: number) {
    const yearsToRetire = Math.max(0, retirementAge - age);
    const accAtRetire = acc * Math.pow(growthFactor, yearsToRetire);
    const lockAtRetire = lock * Math.pow(growthFactor, yearsToRetire);
    
    const canFundBridge = accAtRetire >= bridgeCostAtRetirement;
    const remainingAfterBridge = (accAtRetire - bridgeCostAtRetirement) + lockAtRetire;
    const projectedAtAccess = remainingAfterBridge * Math.pow(growthFactor, bridgeYears);
    
    const isFunded = canFundBridge && projectedAtAccess >= targetPot;
    
    return { isFunded, canFundBridge };
  }

  const statusToday = checkStatus(currentAccessibleBalance, currentLockedBalance, currentAge);
  
  let coastFireAge = -1;
  let coastFirePotAtAge = 0;
  let projectedPotAtRetirement = 0;
  
  let tempAcc = currentAccessibleBalance;
  let tempLock = currentLockedBalance;
  const nextIntegerAge = Math.ceil(currentAge);
  const firstYearFraction = nextIntegerAge - currentAge;

  if (statusToday.isFunded) {
    coastFireAge = currentAge;
    coastFirePotAtAge = currentAccessibleBalance + currentLockedBalance;
    projectedPotAtRetirement = (currentAccessibleBalance + currentLockedBalance) * Math.pow(growthFactor, Math.max(0, retirementAge - currentAge));
  } else {
    if (firstYearFraction > 0) {
      const firstYearGrowthFactor = Math.pow(growthFactor, firstYearFraction);
      const contributions = annualContributionsForAge(currentAge, annualAccessibleContribution, annualLockedContribution, contributionSchedule);
      tempAcc = (tempAcc * firstYearGrowthFactor) + (contributions.accessible * firstYearFraction);
      tempLock = (tempLock * firstYearGrowthFactor) + (contributions.locked * firstYearFraction);
      
      const status = checkStatus(tempAcc, tempLock, nextIntegerAge);
      if (status.isFunded) {
        coastFireAge = nextIntegerAge;
        coastFirePotAtAge = tempAcc + tempLock;
      }
    }
    
    if (coastFireAge === -1) {
      for (let age = nextIntegerAge; age < retirementAge; age++) {
        const contributions = annualContributionsForAge(age, annualAccessibleContribution, annualLockedContribution, contributionSchedule);
        tempAcc = (tempAcc * growthFactor) + contributions.accessible;
        tempLock = (tempLock * growthFactor) + contributions.locked;

        const status = checkStatus(tempAcc, tempLock, age + 1);
        if (status.isFunded) {
          coastFireAge = age + 1;
          coastFirePotAtAge = tempAcc + tempLock;
          break;
        }
      }
    }
    
    if (coastFireAge !== -1) {
      const yearsRemaining = Math.max(0, retirementAge - coastFireAge);
      projectedPotAtRetirement = (tempAcc + tempLock) * Math.pow(growthFactor, yearsRemaining);
    } else {
      projectedPotAtRetirement = tempAcc + tempLock;
    }
  }

  const yearsToRetirement = Math.max(0, retirementAge - currentAge);
  
  const requiredCurrentAccessible = bridgeCostAtRetirement / Math.pow(growthFactor, yearsToRetirement);
  const requiredCurrentBalance = (bridgeCostAtRetirement + (targetPot / Math.pow(growthFactor, bridgeYears))) / Math.pow(growthFactor, yearsToRetirement);

  return {
    coastFireAge,
    isCoastFire: statusToday.isFunded,
    targetPotAtRetirement: targetPot,
    requiredCurrentBalance,
    requiredCurrentAccessible,
    currentCoastGap: Math.max(0, requiredCurrentBalance - (currentAccessibleBalance + currentLockedBalance)),
    projectedPotAtRetirement,
    yearsToCoast: coastFireAge === -1 ? -1 : Math.max(0, Math.floor(coastFireAge - currentAge)),
    bridgeRequired: bridgeCostAtRetirement,
    isBridgeFunded: statusToday.canFundBridge,
    coastFirePotAtAge
  };
}

export type FullFireResult = {
  fullFireAge: number;
  isFullFire: boolean;
  yearsToFullFire: number;
  fullFirePotAtAge: number;
  targetPotAtFullFireAge: number;
};

export function calculateFullFire(
  currentAge: number,
  pensionAccessAge: number,
  currentAccessibleBalance: number,
  currentLockedBalance: number,
  annualExpenses: number,
  realGrowthRate: number,
  swr: number = 4,
  annualAccessibleContribution: number = 0,
  annualLockedContribution: number = 0,
  passiveIncome: number = 0,
  taxCode: string = "1257L",
  region: Region = "england-wales-ni",
  contributionSchedule?: AnnualContributionSchedule
): FullFireResult {
  const taxOnPassive = calculateIncomeTax(passiveIncome, taxCode, 0, region).totalTax;
  const netPassive = Math.max(0, passiveIncome - taxOnPassive);
  const netBridgeExpense = Math.max(0, annualExpenses - netPassive);
  const growthFactor = 1 + (realGrowthRate / 100);
  
  function checkStatus(acc: number, lock: number, age: number) {
    const bridgeYears = Math.max(0, pensionAccessAge - age);
    const pvBridge = calculatePVBridge(netBridgeExpense, realGrowthRate, bridgeYears);
    const solved = solveGrossPensionWithdrawal(annualExpenses - passiveIncome, passiveIncome, 0.75, taxCode, region);
    const targetPot = solved.grossPension / (swr / 100);
    
    const canFundBridge = acc >= pvBridge;
    const remainingAfterBridge = (acc - pvBridge) + lock;
    const projectedAtAccess = remainingAfterBridge * Math.pow(growthFactor, bridgeYears);
    
    const isFunded = canFundBridge && projectedAtAccess >= targetPot;
    const requiredTotal = pvBridge + (targetPot / Math.pow(growthFactor, bridgeYears));
    
    return { isFunded, requiredTotal };
  }

  const statusToday = checkStatus(currentAccessibleBalance, currentLockedBalance, currentAge);
  if (statusToday.isFunded) {
    return {
      fullFireAge: currentAge,
      isFullFire: true,
      yearsToFullFire: 0,
      fullFirePotAtAge: currentAccessibleBalance + currentLockedBalance,
      targetPotAtFullFireAge: statusToday.requiredTotal
    };
  }

  let tempAcc = currentAccessibleBalance;
  let tempLock = currentLockedBalance;
  let fullFireAge = -1;
  let fullFirePotAtAge = 0;
  let targetPotAtFullFireAge = 0;
  
  const nextIntegerAge = Math.ceil(currentAge);
  const firstYearFraction = nextIntegerAge - currentAge;

  if (firstYearFraction > 0) {
    const firstYearGrowthFactor = Math.pow(growthFactor, firstYearFraction);
    const contributions = annualContributionsForAge(currentAge, annualAccessibleContribution, annualLockedContribution, contributionSchedule);
    tempAcc = (tempAcc * firstYearGrowthFactor) + (contributions.accessible * firstYearFraction);
    tempLock = (tempLock * firstYearGrowthFactor) + (contributions.locked * firstYearFraction);
    
    const status = checkStatus(tempAcc, tempLock, nextIntegerAge);
    if (status.isFunded) {
      fullFireAge = nextIntegerAge;
      fullFirePotAtAge = tempAcc + tempLock;
      targetPotAtFullFireAge = status.requiredTotal;
    }
  }

  if (fullFireAge === -1) {
    for (let age = nextIntegerAge; age < 100; age++) {
      const contributions = annualContributionsForAge(age, annualAccessibleContribution, annualLockedContribution, contributionSchedule);
      tempAcc = (tempAcc * growthFactor) + contributions.accessible;
      tempLock = (tempLock * growthFactor) + contributions.locked;
      
      const status = checkStatus(tempAcc, tempLock, age + 1);
      if (status.isFunded) {
        fullFireAge = age + 1;
        fullFirePotAtAge = tempAcc + tempLock;
        targetPotAtFullFireAge = status.requiredTotal;
        break;
      }
    }
  }

  return {
    fullFireAge,
    isFullFire: false,
    yearsToFullFire: fullFireAge === -1 ? -1 : Math.max(0, Math.floor(fullFireAge - currentAge)),
    fullFirePotAtAge,
    targetPotAtFullFireAge
  };
}

export type PotGrowthRow = {
  age: number;
  cash: number;
  isa: number;
  gia: number;
  pension: number;
  accessible: number;
  total: number;
  phase: 'accumulation' | 'coasting' | 'drawdown';
  withdrawalAccessible: number;
  withdrawalPension: number;
  totalWithdrawal: number;
  isShortfall: boolean;
};

export function generatePotGrowthTable(
  buckets: SavingsBucket[],
  currentAge: number,
  endAge: number,
  realGrowthRate: number,
  pensionAccessAge: number,
  coastFireAge: number,
  annualAccessibleContribution: number,
  annualLockedContribution: number,
  retirementAge: number,
  annualExpenses: number,
  passiveIncome: number = 0,
  taxCode: string = "1257L",
  region: Region = "england-wales-ni",
  pensionTaxMethod: 'ufpls' | 'lump-sum' = 'ufpls'
): PotGrowthRow[] {
  const growthFactor = 1 + (realGrowthRate / 100);

  let cashBalance = 0;
  let isaBalance = 0;
  let giaBalance = 0;
  let pensionBalance = 0;

  const totalAccessible = buckets.reduce((s, b) => {
    const t = b.type.toLowerCase();
    if (t === 'cash' || t === 'isa' || t === 'lisa' || t === 'gia') return s + clampNumber(b.balance);
    return s;
  }, 0) || 1;

  const isaShare = buckets.filter(b => ['isa', 'lisa'].includes(b.type.toLowerCase()))
    .reduce((s, b) => s + clampNumber(b.balance), 0) / totalAccessible;
  const cashShare = buckets.filter(b => b.type.toLowerCase() === 'cash')
    .reduce((s, b) => s + clampNumber(b.balance), 0) / totalAccessible;
  const giaShare = Math.max(0, 1 - isaShare - cashShare);

  const annualIsaContrib = annualAccessibleContribution * isaShare;
  const annualCashContrib = annualAccessibleContribution * cashShare;
  const annualGiaContrib = annualAccessibleContribution * giaShare;

  const annualPotContributionsForAge = (age: number) => {
    if (buckets.length === 0) {
      return {
        cash: annualCashContrib,
        isa: annualIsaContrib,
        gia: annualGiaContrib,
        pension: annualLockedContribution,
      };
    }

    return buckets.reduce((acc, bucket) => {
      if (bucket.isHidden) return acc;

      const monthly = Math.max(0, clampNumber(bucket.monthly));
      if (monthly <= 0) return acc;

      const effectiveStopAge = bucket.stopContributingAge;
      if (effectiveStopAge && age >= effectiveStopAge) return acc;

      const effectiveWithdrawAge = bucket.startWithdrawalAge;
      if (effectiveWithdrawAge && age >= effectiveWithdrawAge) return acc;

      const annual = monthly * 12;
      const type = bucket.type.toLowerCase();

      if (type === 'lisa') {
        if (age < 50) {
          acc.isa += annual * 1.25;
        }
        return acc;
      }

      if (type === 'cash') acc.cash += annual;
      else if (type === 'isa') acc.isa += annual;
      else if (type === 'gia') acc.gia += annual;
      else if (type.includes('pension')) acc.pension += annual;

      return acc;
    }, { cash: 0, isa: 0, gia: 0, pension: 0 });
  };

  for (const b of buckets) {
    const t = b.type.toLowerCase();
    const bal = clampNumber(b.balance);
    if (t === 'cash') cashBalance += bal;
    else if (t === 'isa' || t === 'lisa') isaBalance += bal;
    else if (t === 'gia') giaBalance += bal;
    else pensionBalance += bal;
  }

  const rows: PotGrowthRow[] = [];
  const startAge = Math.ceil(currentAge);

  for (let age = startAge; age <= endAge; age++) {
    const effectiveCoastAge = coastFireAge > 0 ? Math.floor(coastFireAge) : Infinity;
    const phase: PotGrowthRow['phase'] =
      age <= effectiveCoastAge ? 'accumulation'
      : age < retirementAge   ? 'coasting'
      : 'drawdown';

    cashBalance    *= growthFactor;
    isaBalance     *= growthFactor;
    giaBalance     *= growthFactor;
    pensionBalance *= growthFactor;

    if (phase === 'accumulation') {
      const contributions = annualPotContributionsForAge(age);
      isaBalance     += contributions.isa;
      cashBalance    += contributions.cash;
      giaBalance     += contributions.gia;
      pensionBalance += contributions.pension;
    }

    let withdrawalAccessible = 0;
    let withdrawalPension = 0;
    let isShortfall = false;

    if (phase === 'drawdown') {
      const pensionUnlockAge = Math.max(Math.floor(retirementAge), Math.floor(pensionAccessAge));
      if (pensionTaxMethod === 'lump-sum' && age === pensionUnlockAge) {
        const lumpSum = pensionBalance * 0.25;
        pensionBalance -= lumpSum;
        isaBalance += lumpSum;
      }

      const accessibleNow = cashBalance + isaBalance + giaBalance;
      const pensionNow = pensionBalance;
      const pensionUnlocked = age >= pensionAccessAge;
      const pensionTaxableFraction = (pensionTaxMethod === 'lump-sum' && age >= pensionUnlockAge) ? 1.0 : 0.75;

      const taxOnPassive = calculateIncomeTax(passiveIncome, taxCode, 0, region).totalTax;
      const netPassive = Math.max(0, passiveIncome - taxOnPassive);
      const netToWithdraw = Math.max(0, annualExpenses - netPassive);

      if (netToWithdraw > 0) {
        if (!pensionUnlocked) {
          withdrawalAccessible = Math.min(netToWithdraw, accessibleNow);
          withdrawalPension = 0;
          if (withdrawalAccessible < netToWithdraw) isShortfall = true;
        } else {
          const totalNow = accessibleNow + pensionNow;
          if (totalNow > 0) {
            const accessibleFrac = accessibleNow / totalNow;
            const netFromAccessible = netToWithdraw * accessibleFrac;
            withdrawalAccessible = Math.min(accessibleNow, netFromAccessible);

            const netTarget = annualExpenses - passiveIncome - withdrawalAccessible;
            const solved = solveGrossPensionWithdrawal(netTarget, passiveIncome, pensionTaxableFraction, taxCode, region);
            let grossPension = solved.grossPension;

            if (grossPension <= pensionNow) {
              withdrawalPension = grossPension;
            } else {
              withdrawalPension = pensionNow;
              const combinedTaxable = passiveIncome + pensionTaxableFraction * pensionNow;
              const combinedTax = calculateIncomeTax(combinedTaxable, taxCode, 0, region).totalTax;
              const netFromPensionAndPassive = pensionNow + passiveIncome - combinedTax;
              const remainingNetNeeded = annualExpenses - netFromPensionAndPassive - withdrawalAccessible;

              if (remainingNetNeeded > 0) {
                const leftoverAccessible = accessibleNow - withdrawalAccessible;
                const extraAccessible = Math.min(leftoverAccessible, remainingNetNeeded);
                withdrawalAccessible += extraAccessible;
                if (withdrawalAccessible + netFromPensionAndPassive < annualExpenses) {
                  isShortfall = true;
                }
              }
            }
          } else {
            isShortfall = true;
          }
        }
      }

      if (withdrawalAccessible > 0 && accessibleNow > 0) {
        const accFrac = withdrawalAccessible / accessibleNow;
        cashBalance    -= cashBalance    * accFrac;
        isaBalance     -= isaBalance     * accFrac;
        giaBalance     -= giaBalance     * accFrac;
      }
      pensionBalance -= withdrawalPension;

      cashBalance    = Math.max(0, cashBalance);
      isaBalance     = Math.max(0, isaBalance);
      giaBalance     = Math.max(0, giaBalance);
      pensionBalance = Math.max(0, pensionBalance);
    }

    const accessible = cashBalance + isaBalance + giaBalance + (age >= pensionAccessAge ? pensionBalance : 0);
    const total = cashBalance + isaBalance + giaBalance + pensionBalance;

    rows.push({
      age,
      cash: cashBalance,
      isa: isaBalance,
      gia: giaBalance,
      pension: pensionBalance,
      accessible,
      total,
      phase,
      withdrawalAccessible,
      withdrawalPension,
      totalWithdrawal: withdrawalAccessible + withdrawalPension,
      isShortfall,
    });
  }

  return rows;
}

export type FinancialSnapshot = {
  profile: { currentAge: number; retirementAge: number; pensionAccessAge: number };
  financialHealth: {
    monthlyExpenses: number;
    monthlySurplus: number;
    mortgage: { 
      remaining: number; 
      monthlyPayment: number; 
      monthsToPayoff: number; 
      willBePaidOffAtRetirement: boolean; 
      ageAtPayoff: number;
    };
  };
  guaranteedIncome: {
    statePension: { amount: number; age: number };
    dbPensions: { label: string; amount: number; age: number }[];
    other: { label: string; amount: number; age: number; isTaxable: boolean }[];
  };
  buckets: {
    id: string;
    type: string;
    label: string;
    balance: number;
    projected: number;
    isTaxable: boolean;
    accessibleFromAge: number;
    annualRate: number;
  }[];
};

export function getFinancialSnapshot(
  birthYear: number,
  birthMonth: number,
  retirementAge: number,
  budgetExpenses: number,
  monthlySurplus: number,
  mortgageSummary: any,
  mortgageInputs: MortgageInputs,
  savings: any[],
  otherIncome: any[],
  pensionAccessAge: number,
  statePension: { amount: number; age: number },
  dbPensions: { label: string; amount: number; age: number }[]
): FinancialSnapshot {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentAge = (currentYear - birthYear) + (currentMonth - birthMonth) / 12;

  const monthsUntilRetirement = (retirementAge - currentAge) * 12;
  const willBePaidOffAtRetirement = mortgageSummary.payoffMonths <= monthsUntilRetirement;
  const ageAtPayoff = currentAge + (mortgageSummary.payoffMonths / 12);

  return {
    profile: { currentAge, retirementAge, pensionAccessAge },
    financialHealth: {
      monthlyExpenses: budgetExpenses,
      monthlySurplus: monthlySurplus,
      mortgage: {
        remaining: mortgageInputs.amount,
        monthlyPayment: mortgageSummary.standardPayment,
        monthsToPayoff: mortgageSummary.payoffMonths,
        willBePaidOffAtRetirement,
        ageAtPayoff
      },
    },
    guaranteedIncome: {
      statePension,
      dbPensions,
      other: otherIncome.map(i => ({
        label: i.label,
        amount: i.amount * 12,
        age: i.startAge || 0,
        isTaxable: i.isTaxable || false,
      }))
    },
    buckets: savings.map(s => {
      let accessibleFromAge = 0;
      const type = s.type.toLowerCase();
      if (type === 'lisa') {
        accessibleFromAge = 60;
      } else if (type === 'pension' || type === 'workplace-pension' || type === 'workplace-private-pension' || type.includes('pension')) {
        // Special case for DB pensions which have their own age
        if (['nhs-pension', 'civil-service-pension', 'teachers-pension'].includes(type)) {
          accessibleFromAge = s.startWithdrawalAge || 67;
        } else {
          accessibleFromAge = pensionAccessAge;
        }
      }
      
      return {
        id: s.id,
        type: s.type,
        label: s.label,
        balance: s.balance,
        projected: s.projected || 0,
        isTaxable: type.includes('pension'),
        accessibleFromAge,
        annualRate: s.annualRate || 0
      };
    }),
  };
}
export function calculateRetirementGrossRequired(
  targetNetFromPots: number,
  taxableFraction: number,
  taxCode: string,
  region: Region,
  baselineTaxableIncome: number = 0
) {
  const netFromTaxable = targetNetFromPots * taxableFraction;
  const netFromNonTaxable = targetNetFromPots * (1 - taxableFraction);

  const baselineTax = calculateIncomeTax(baselineTaxableIncome, taxCode, 0, region).totalTax;

  // Solve for Gross Pension W such that:
  // W - [Tax(W * 0.75 + baselineTaxable) - Tax(baselineTaxable)] = netFromTaxable
  let low = 0;
  let high = Math.max(100000, netFromTaxable * 3);
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    const totalTaxable = mid * 0.75 + baselineTaxableIncome;
    const totalTax = calculateIncomeTax(totalTaxable, taxCode, 0, region).totalTax;
    const extraTax = totalTax - baselineTax;
    const net = mid - extraTax;
    
    if (net < netFromTaxable) low = mid;
    else high = mid;
  }
  
  const grossPension = high;
  const totalAnnualTaxOnPots = calculateIncomeTax(grossPension * 0.75 + baselineTaxableIncome, taxCode, 0, region).totalTax - baselineTax;
  
  return {
    grossPension,
    netFromNonTaxable,
    totalGrossAnnual: grossPension + netFromNonTaxable,
    totalAnnualTaxOnPots
  };
}

export function calculateGrowthSinceLastUpdate(bucket: SavingsBucket, today: Date = new Date()) {
  if (!bucket.lastUpdated) return { growth: 0, days: 0 };
  const lastUpdate = new Date(bucket.lastUpdated);
  const diffTime = today.getTime() - lastUpdate.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { growth: 0, days: 0 };

  const annualRate = clampNumber(bucket.annualRate) / 100;
  const dailyRate = annualRate / 365;
  
  // Standard compound interest formula: A = P(1 + r)^t
  const newBalance = bucket.balance * Math.pow(1 + dailyRate, diffDays);
  const growth = newBalance - bucket.balance;
  
  return { growth, days: diffDays };
}

export function getPendingMonthlyContributions(bucket: SavingsBucket, today: Date = new Date()) {
  if (!bucket.lastUpdated || bucket.monthly <= 0) return 0;
  const lastUpdate = new Date(bucket.lastUpdated);
  
  // Calculate months between dates
  const yearDiff = today.getFullYear() - lastUpdate.getFullYear();
  const monthDiff = today.getMonth() - lastUpdate.getMonth();
  let totalMonths = yearDiff * 12 + monthDiff;
  
  // Adjust if today's day is before last update's day
  if (today.getDate() < lastUpdate.getDate()) {
    totalMonths--;
  }
  
  return Math.max(0, totalMonths);
}

export function generateSavingsCSV(savings: SavingsBucket[]) {
  const headers = ["Account Name", "Type", "Total Capital", "Total Growth", "Current Balance", "Monthly Contribution", "Annual Growth Rate", "Last Updated"];
  const rows = savings.map(s => {
    const { currentValue, contributed, other } = calculateCurrentBucketValue(s);
    return [
      s.label,
      s.type,
      contributed.toFixed(2),
      other.toFixed(2),
      currentValue.toFixed(2),
      s.monthly.toFixed(2),
      s.annualRate.toFixed(2) + "%",
      s.lastUpdated || "N/A"
    ];
  });
  
  return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
}

export function requiredGrossForNet(targetNet: number, taxCode: string, region: Region, includeStudentLoan = false, pensionRate = 0) {
  let low = 0;
  let high = Math.max(50000, targetNet * 3); // Increased multiplier for more headroom with deductions
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    
    // Pension deduction (assumed Net Pay arrangement: reduces taxable income, not NI)
    const pensionAmount = mid * (pensionRate / 100);
    const taxableIncome = Math.max(0, mid - pensionAmount);
    
    const tax = calculateIncomeTax(taxableIncome, taxCode, 0, region).totalTax;
    const ni = calculateNationalInsurance(mid, "class1");
    
    // Student Loan (Plan 2 / Plan 5 style approximation: 9% over ~£25k-£27k)
    let studentLoan = 0;
    if (includeStudentLoan) {
      const threshold = 27295; // Plan 2 threshold for 2024/25
      studentLoan = Math.max(0, (mid - threshold) * 0.09);
    }
    
    const net = mid - tax - ni - pensionAmount - studentLoan;
    
    if (net < targetNet) low = mid;
    else high = mid;
  }
  return roundPounds(high);
}

export interface ExcelPlanRow {
  age: number;
  netIncome: number;
  source: "Salary" | "ISA" | "PP" | "ISA+PP" | "Shortfall";
  phase: "Building" | "Coasting" | "FI";
  isaTotal: number;
  isaChange: number;
  ppTotal: number;
  ppChange: number;
  postTaxSP: number;
  netRequired: number;
  totalPot: number;
}

export function generateExcelPlanTable(
  currentAge: number,
  coastAge: number,
  retirementAge: number,
  endAge: number,
  startingIsa: number,
  startingPp: number,
  netIncomeRequired: number,
  incomeInflation: number,
  isaGrowth: number,
  ppGrowth: number,
  isaAddition: number,
  ppAddition: number,
  statePensionStart: number,
  statePensionTaxFactor: number,
  statePensionInflation: number,
  ppTaxFactor: number
): ExcelPlanRow[] {
  const rows: ExcelPlanRow[] = [];
  const startAge = Math.ceil(currentAge);

  let isaTotal = startingIsa;
  let ppTotal = startingPp;
  let netIncome = netIncomeRequired;
  let postTaxSP = statePensionStart * statePensionTaxFactor;

  // Track previous year's changes to calculate current year's totals
  let prevIsaChange = 0;
  let prevPpChange = 0;

  for (let age = startAge; age <= endAge; age++) {
    // 1. Calculate pot totals based on previous year's balances and changes
    if (age > startAge) {
      isaTotal = isaTotal * (1 + isaGrowth / 100) + prevIsaChange;
      ppTotal = ppTotal * (1 + ppGrowth / 100) + prevPpChange;
      netIncome = netIncome * (1 + incomeInflation / 100);
      postTaxSP = postTaxSP * (1 + statePensionInflation / 100);
    }

    // Guard against negative balances
    isaTotal = Math.max(0, isaTotal);
    ppTotal = Math.max(0, ppTotal);

    // 2. Determine phase
    let phase: "Building" | "Coasting" | "FI" = "FI";
    if (age < coastAge) {
      phase = "Building";
    } else if (age < retirementAge) {
      phase = "Coasting";
    }

    // 3. Net Required from Pots
    const netRequired = age > 67 ? Math.max(0, netIncome - postTaxSP) : netIncome;

    // 4. Source & Changes
    let source: "Salary" | "ISA" | "PP" | "ISA+PP" | "Shortfall" = "Salary";
    let isaChange = 0;
    let ppChange = 0;

    if (phase === "Building") {
      source = "Salary";
      isaChange = isaAddition;
      ppChange = ppAddition;
    } else if (phase === "Coasting") {
      source = "Salary";
      isaChange = 0;
      ppChange = 0;
    } else {
      // FI Phase - Withdrawals
      if (isaTotal >= netRequired) {
        source = "ISA";
        isaChange = -netRequired;
        ppChange = 0;
      } else if (ppTotal * ppTaxFactor >= netRequired) {
        source = "PP";
        isaChange = 0;
        ppChange = -netRequired / ppTaxFactor;
      } else if (isaTotal + ppTotal * ppTaxFactor >= netRequired) {
        source = "ISA+PP";
        isaChange = -isaTotal;
        ppChange = -(netRequired - isaTotal) / ppTaxFactor;
      } else {
        source = "Shortfall";
        isaChange = -isaTotal;
        ppChange = -ppTotal;
      }
    }

    rows.push({
      age,
      netIncome,
      source,
      phase,
      isaTotal,
      isaChange,
      ppTotal,
      ppChange,
      postTaxSP,
      netRequired,
      totalPot: isaTotal + ppTotal,
    });

    // Save changes to apply in the next iteration
    prevIsaChange = isaChange;
    prevPpChange = ppChange;
  }

  return rows;
}

export function randomNormal(mean: number, stdDev: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + stdDev * num;
}

export type MonteCarloResult = {
  successRate: number;
  medianPath: number[];
  pessimisticPath: number[];
  optimisticPath: number[];
  ages: number[];
};

export function runMonteCarloSimulation(
  cashAtRetire: number,
  isaAtRetire: number,
  giaAtRetire: number,
  pensionAtRetire: number,
  retirementAge: number,
  endAge: number,
  pensionAccessAge: number,
  annualExpenses: number,
  passiveIncome: number,
  realGrowthMean: number,
  volatility: number = 12,
  taxCode: string = "1257L",
  region: Region = "england-wales-ni",
  pensionTaxMethod: 'ufpls' | 'lump-sum' = 'ufpls',
  numSimulations: number = 1000
): MonteCarloResult {
  const ages: number[] = [];
  const startAge = Math.floor(retirementAge);
  for (let a = startAge; a <= endAge; a++) {
    ages.push(a);
  }

  const paths: number[][] = [];
  let successCount = 0;

  for (let sim = 0; sim < numSimulations; sim++) {
    let cash = cashAtRetire;
    let isa = isaAtRetire;
    let gia = giaAtRetire;
    let pension = pensionAtRetire;
    let isDepleted = false;
    const path: number[] = [];

    for (let age = startAge; age <= endAge; age++) {
      const total = cash + isa + gia + pension;
      path.push(total);

      if (isDepleted) {
        continue;
      }

      // Generate random annual real growth rate for this year
      const randGrowth = randomNormal(realGrowthMean, volatility);
      const growthFactor = 1 + (randGrowth / 100);

      // Apply growth
      cash *= growthFactor;
      isa *= growthFactor;
      gia *= growthFactor;
      pension *= growthFactor;

      // Handle lump sum transfer if it's the unlock year
      const pensionUnlockAge = Math.max(Math.floor(retirementAge), Math.floor(pensionAccessAge));
      if (pensionTaxMethod === 'lump-sum' && age === pensionUnlockAge) {
        const lumpSum = pension * 0.25;
        pension -= lumpSum;
        isa += lumpSum;
      }

      const accessibleNow = cash + isa + gia;
      const pensionNow = pension;
      const pensionUnlocked = age >= pensionAccessAge;
      const pensionTaxableFraction = (pensionTaxMethod === 'lump-sum' && age >= pensionUnlockAge) ? 1.0 : 0.75;

      const taxOnPassive = calculateIncomeTax(passiveIncome, taxCode, 0, region).totalTax;
      const netPassive = Math.max(0, passiveIncome - taxOnPassive);
      const netToWithdraw = Math.max(0, annualExpenses - netPassive);

      let withdrawalAccessible = 0;
      let withdrawalPension = 0;

      if (netToWithdraw > 0) {
        if (!pensionUnlocked) {
          withdrawalAccessible = Math.min(netToWithdraw, accessibleNow);
          if (withdrawalAccessible < netToWithdraw) {
            isDepleted = true;
          }
        } else {
          const totalNow = accessibleNow + pensionNow;
          if (totalNow > 0) {
            const accessibleFrac = accessibleNow / totalNow;
            const netFromAccessible = netToWithdraw * accessibleFrac;
            withdrawalAccessible = Math.min(accessibleNow, netFromAccessible);

            const netTarget = annualExpenses - passiveIncome - withdrawalAccessible;
            const solved = solveGrossPensionWithdrawal(netTarget, passiveIncome, pensionTaxableFraction, taxCode, region);
            let grossPension = solved.grossPension;

            if (grossPension <= pensionNow) {
              withdrawalPension = grossPension;
            } else {
              withdrawalPension = pensionNow;
              const combinedTaxable = passiveIncome + pensionTaxableFraction * pensionNow;
              const combinedTax = calculateIncomeTax(combinedTaxable, taxCode, 0, region).totalTax;
              const netFromPensionAndPassive = pensionNow + passiveIncome - combinedTax;
              const remainingNetNeeded = annualExpenses - netFromPensionAndPassive - withdrawalAccessible;

              if (remainingNetNeeded > 0) {
                const leftoverAccessible = accessibleNow - withdrawalAccessible;
                const extraAccessible = Math.min(leftoverAccessible, remainingNetNeeded);
                withdrawalAccessible += extraAccessible;
                if (withdrawalAccessible + netFromPensionAndPassive < annualExpenses) {
                  isDepleted = true;
                }
              }
            }
          } else {
            isDepleted = true;
          }
        }
      }

      if (isDepleted) {
        cash = 0;
        isa = 0;
        gia = 0;
        pension = 0;
      } else {
        if (withdrawalAccessible > 0 && accessibleNow > 0) {
          const accFrac = withdrawalAccessible / accessibleNow;
          cash -= cash * accFrac;
          isa -= isa * accFrac;
          gia -= gia * accFrac;
        }
        pension -= withdrawalPension;

        cash = Math.max(0, cash);
        isa = Math.max(0, isa);
        gia = Math.max(0, gia);
        pension = Math.max(0, pension);
      }
    }

    if (!isDepleted && (cash + isa + gia + pension) > 0) {
      successCount++;
    }
    paths.push(path);
  }

  const medianPath: number[] = [];
  const pessimisticPath: number[] = [];
  const optimisticPath: number[] = [];

  const numAges = ages.length;
  for (let ageIdx = 0; ageIdx < numAges; ageIdx++) {
    const valuesAtAge = paths.map(path => path[ageIdx] || 0);
    valuesAtAge.sort((a, b) => a - b);

    const idx10 = Math.floor(numSimulations * 0.1);
    const idx50 = Math.floor(numSimulations * 0.5);
    const idx90 = Math.floor(numSimulations * 0.9);

    pessimisticPath.push(valuesAtAge[idx10]);
    medianPath.push(valuesAtAge[idx50]);
    optimisticPath.push(valuesAtAge[idx90]);
  }

  return {
    successRate: (successCount / numSimulations) * 100,
    medianPath,
    pessimisticPath,
    optimisticPath,
    ages
  };
}
