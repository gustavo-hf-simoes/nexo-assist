export function EmployeeBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <p className="max-w-[80%] whitespace-pre-wrap rounded-[12px_12px_4px_12px] bg-ink px-4 py-2.5 text-[14.5px] leading-[22px] text-white">
        {text}
      </p>
    </div>
  );
}
