import { Demo } from "@/models/copy/Demo";
import { useRegistry } from "../hooks/useRegistry";

export function DemoBanner() {
  const { INTERACTIVE_DEMO } = useRegistry("env");
  if (!INTERACTIVE_DEMO) {
    return null;
  }
  return (
    <div className="flex flex-col items-center gap-2 bg-c-accent px-4 py-2 text-sm text-white">
      <span className="font-bold">{Demo.description}</span>
    </div>
  );
}
