import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface JsonViewerProps {
  data: unknown;
  initialExpandDepth?: number;
}

export function JsonViewer({ data, initialExpandDepth = 2 }: JsonViewerProps) {
  return (
    <div className="font-mono text-sm">
      <JsonNode value={data} depth={0} initialExpandDepth={initialExpandDepth} />
    </div>
  );
}

interface JsonNodeProps {
  value: unknown;
  depth: number;
  initialExpandDepth: number;
  keyName?: string;
  isLast?: boolean;
}

function JsonNode({ value, depth, initialExpandDepth, keyName, isLast = true }: JsonNodeProps) {
  const [isExpanded, setIsExpanded] = useState(depth < initialExpandDepth);

  const valueType = useMemo(() => {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  }, [value]);

  const isExpandable = valueType === "object" || valueType === "array";
  const isEmpty =
    (valueType === "object" && Object.keys(value as object).length === 0) ||
    (valueType === "array" && (value as unknown[]).length === 0);

  const indent = depth * 16;

  const renderKey = () => {
    if (keyName === undefined) return null;
    return (
      <span className="text-purple-600 dark:text-purple-400">
        "{keyName}"
      </span>
    );
  };

  const renderColon = () => {
    if (keyName === undefined) return null;
    return <span className="text-foreground">: </span>;
  };

  const renderComma = () => {
    if (isLast) return null;
    return <span className="text-foreground">,</span>;
  };

  // Primitive values
  if (!isExpandable) {
    let valueElement: React.ReactNode;

    switch (valueType) {
      case "string":
        valueElement = (
          <span className="text-green-600 dark:text-green-400">
            "{String(value)}"
          </span>
        );
        break;
      case "number":
        valueElement = (
          <span className="text-blue-600 dark:text-blue-400">{String(value)}</span>
        );
        break;
      case "boolean":
        valueElement = (
          <span className="text-orange-600 dark:text-orange-400">
            {String(value)}
          </span>
        );
        break;
      case "null":
        valueElement = (
          <span className="text-gray-500 dark:text-gray-400 italic">null</span>
        );
        break;
      default:
        valueElement = <span className="text-foreground">{String(value)}</span>;
    }

    return (
      <div style={{ paddingLeft: indent }}>
        {renderKey()}
        {renderColon()}
        {valueElement}
        {renderComma()}
      </div>
    );
  }

  // Empty object or array
  if (isEmpty) {
    return (
      <div style={{ paddingLeft: indent }}>
        {renderKey()}
        {renderColon()}
        <span className="text-foreground">
          {valueType === "array" ? "[]" : "{}"}
        </span>
        {renderComma()}
      </div>
    );
  }

  // Expandable object or array
  const openBracket = valueType === "array" ? "[" : "{";
  const closeBracket = valueType === "array" ? "]" : "}";
  const entries =
    valueType === "array"
      ? (value as unknown[]).map((v, i) => ({ key: i, value: v }))
      : Object.entries(value as object).map(([k, v]) => ({ key: k, value: v }));

  const itemCount = entries.length;

  return (
    <div>
      <div
        style={{ paddingLeft: indent }}
        className="flex items-start cursor-pointer hover:bg-muted/50 rounded -ml-1 pl-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="flex-shrink-0 w-4 h-5 flex items-center justify-center text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </span>
        <span>
          {renderKey()}
          {renderColon()}
          <span className="text-foreground">{openBracket}</span>
          {!isExpanded && (
            <>
              <span className="text-muted-foreground text-xs mx-1">
                {itemCount} {itemCount === 1 ? "item" : "items"}
              </span>
              <span className="text-foreground">{closeBracket}</span>
              {renderComma()}
            </>
          )}
        </span>
      </div>

      {isExpanded && (
        <>
          {entries.map((entry, index) => (
            <JsonNode
              key={entry.key}
              value={entry.value}
              depth={depth + 1}
              initialExpandDepth={initialExpandDepth}
              keyName={valueType === "object" ? String(entry.key) : undefined}
              isLast={index === entries.length - 1}
            />
          ))}
          <div style={{ paddingLeft: indent + 16 }}>
            <span className="text-foreground">{closeBracket}</span>
            {renderComma()}
          </div>
        </>
      )}
    </div>
  );
}

export default JsonViewer;
