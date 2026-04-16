const STEPS = ["Pending", "Accepted", "Paid"] as const;

const stepColors: Record<string, { active: string; dot: string }> = {
  Pending: { active: "bg-amber-500", dot: "border-amber-500" },
  Accepted: { active: "bg-blue-500", dot: "border-blue-500" },
  Paid: { active: "bg-green-500", dot: "border-green-500" },
};

export default function WorkflowIndicator({ status }: { status: string }) {
  if (status === "Rejected") {
    return <span className="text-[10px] text-red-500 font-medium">Rejected</span>;
  }

  const currentIdx = STEPS.indexOf(status as any);

  return (
    <div className="flex items-center gap-0.5">
      {STEPS.map((step, i) => {
        const reached = i <= currentIdx;
        const colors = stepColors[step];
        return (
          <div key={step} className="flex items-center">
            <div
              className={`h-2 w-2 rounded-full border-[1.5px] ${
                reached ? `${colors.active} border-transparent` : "bg-transparent border-gray-300"
              }`}
              title={step}
            />
            {i < STEPS.length - 1 && (
              <div className={`w-3 h-[1.5px] ${i < currentIdx ? "bg-gray-400" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
