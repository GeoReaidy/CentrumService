type LoadingProps = {
  context?: string;
  message?: string;
  className?: string;
};

function LoadingVisual() {
  return (
    <div className="centrum-loader" aria-hidden="true">
      <span className="centrum-loader-orbit centrum-loader-orbit-outer" />
      <span className="centrum-loader-orbit centrum-loader-orbit-inner" />
      <strong>C</strong>
    </div>
  );
}

export function CentrumLoadingPanel({
  context = "Centrum Service",
  message = "Loading the latest information securely.",
  className = "",
}: LoadingProps) {
  return (
    <div className={`centrum-loading-card ${className}`.trim()} role="status" aria-live="polite" aria-busy="true">
      <LoadingVisual />
      <div className="badge card-badge">{context}</div>
      <h2>Getting things ready</h2>
      <p>{message}</p>
      <div className="centrum-loading-progress" aria-hidden="true"><span /></div>
    </div>
  );
}

export function CentrumLoadingScreen(props: LoadingProps) {
  return (
    <section className={`centrum-loading-screen ${props.className ?? ""}`.trim()}>
      <CentrumLoadingPanel context={props.context} message={props.message} />
    </section>
  );
}

export function CentrumInlineLoading({ message = "Loading..." }: Pick<LoadingProps, "message">) {
  return <span className="centrum-inline-loading" role="status" aria-live="polite"><span className="app-state-spinner" aria-hidden="true" />{message}</span>;
}
