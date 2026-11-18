export function SessionCounter({ used, limit }: { used: number; limit: number }) {
  const reached = used >= limit;
  return (
    <div className="flex flex-col items-end gap-1">
      {reached ? (
        <p role="alert" className="text-xs font-medium text-danger">
          Você atingiu o limite de {limit} mensagens desta sessão. Abra uma nova sessão ou fale com a TI.
        </p>
      ) : null}
      <p className={`text-xs ${reached ? "text-danger" : "text-muted"}`}>
        {used}/{limit} mensagens nesta sessão
      </p>
    </div>
  );
}
