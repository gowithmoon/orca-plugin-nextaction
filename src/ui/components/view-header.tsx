// A view's heading: its name and, when known, how many tasks it holds.

export function ViewHeader(props: { title: string; count?: number }) {
  return (
    <header className="nextaction-view-header">
      <h2 className="nextaction-view-title">{props.title}</h2>
      {props.count !== undefined && (
        <span className="nextaction-view-count">{props.count}</span>
      )}
    </header>
  );
}
