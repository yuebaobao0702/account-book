import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";
import { formatAmount } from "../../lib/utils";

interface TopBarProps {
  year: number;
  month: number;
  income: number;
  expense: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

export function TopBar({
  year,
  month,
  income,
  expense,
  onPrevMonth,
  onNextMonth,
}: TopBarProps) {
  const now = new Date();
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <header className="h-16 border-b bg-background flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onPrevMonth}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-lg font-semibold min-w-[120px] text-center">
          {year}年{month}月
          {isCurrentMonth && (
            <span className="ml-2 text-xs text-muted-foreground">(本月)</span>
          )}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onNextMonth}
          disabled={isCurrentMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex items-center gap-6 text-sm">
        <div>
          <span className="text-muted-foreground mr-2">收入</span>
          <span className="income-text font-medium">{formatAmount(income)}</span>
        </div>
        <div>
          <span className="text-muted-foreground mr-2">支出</span>
          <span className="expense-text font-medium">{formatAmount(expense)}</span>
        </div>
        <div className="pl-4 border-l">
          <span className="text-muted-foreground mr-2">结余</span>
          <span className="font-medium">{formatAmount(income - expense)}</span>
        </div>
      </div>
    </header>
  );
}
