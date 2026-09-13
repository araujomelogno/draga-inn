export function Marca({ subtitulo }: { subtitulo?: string }) {
  return (
    <span className="marca">
      <svg width="26" height="26" viewBox="0 0 192 192" aria-hidden="true">
        <rect width="192" height="192" rx="34" fill="#ffffff" fillOpacity="0.14" />
        <path d="M48 142V56h34c26 0 42 16 42 43s-16 43-42 43H48Zm24-21h9c12 0 19-8 19-22s-7-22-19-22h-9v44Z" fill="#fff" />
        <path d="M132 142V56h14v86h-14Z" fill="#7ab394" />
      </svg>
      <span>
        Draga Inn
        {subtitulo ? <span style={{ fontWeight: 400, opacity: 0.85 }}> · {subtitulo}</span> : null}
      </span>
    </span>
  );
}
