import React, { useState } from "react";
import { ToolCard } from "../common/ToolCard";
import { BudgetRuleCalculator } from "./BudgetRuleCalculator";
import { CompoundInterestCalculator } from "./CompoundInterestCalculator";
import { CreditCardInterestCalculator } from "./CreditCardInterestCalculator";
import { DebtPayoffPlanner } from "./DebtPayoffPlanner";
import { EmergencyFundCalculator } from "./EmergencyFundCalculator";
import { LoanPayoffCalculator } from "./LoanPayoffCalculator";
import { NetWorthProjection } from "./NetWorthProjection";
import { RecurringSpendAudit } from "./RecurringSpendAudit";
import { SavingsGoalCalculator } from "./SavingsGoalCalculator";
import { TOOLS_CATALOG } from "../../constants";

export function ToolsView({ accounts, balances, transactions }) {
  const [activeToolId, setActiveToolId] = useState(null);

  const back = () => setActiveToolId(null);
  if (activeToolId === "compound-interest") return <CompoundInterestCalculator onBack={back} accounts={accounts} balances={balances} />;
  if (activeToolId === "savings-goal") return <SavingsGoalCalculator onBack={back} accounts={accounts} balances={balances} />;
  if (activeToolId === "50-30-20") return <BudgetRuleCalculator onBack={back} transactions={transactions} />;
  if (activeToolId === "emergency-fund") return <EmergencyFundCalculator onBack={back} accounts={accounts} balances={balances} transactions={transactions} />;
  if (activeToolId === "debt-payoff") return <DebtPayoffPlanner onBack={back} accounts={accounts} balances={balances} />;
  if (activeToolId === "net-worth-projection") return <NetWorthProjection onBack={back} accounts={accounts} balances={balances} />;
  if (activeToolId === "recurring-spend") return <RecurringSpendAudit onBack={back} transactions={transactions} />;
  if (activeToolId === "credit-card-interest") return <CreditCardInterestCalculator onBack={back} accounts={accounts} balances={balances} />;
  if (activeToolId === "loan-payoff") return <LoanPayoffCalculator onBack={back} />;

  return (
    <div className="tools-view">
      {TOOLS_CATALOG.map((cat) => (
        <div key={cat.id} className="tools-category">
          <div className="tools-category-title">
            <cat.icon size={15} /> {cat.label}
          </div>
          <div className="tools-grid">
            {cat.tools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} onOpen={setActiveToolId} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
