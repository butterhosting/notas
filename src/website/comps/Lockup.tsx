import clsx from "clsx";

// proportions match the other Butterhost.ing apps (Dolog, Excalibee)
export namespace Lockup {
  export function Large({ className }: { className?: string }) {
    return <Internal.Lockup className={clsx("gap-1", className)} logo="size-9" name="text-4xl" byline="pl-10" />;
  }

  export function Small({ className }: { className?: string }) {
    return (
      <Internal.Lockup
        className={clsx("gap-0.5 opacity-50 grayscale transition hover:opacity-100 hover:grayscale-0", className)}
        logo="size-6"
        name="text-2xl"
        byline="pl-7 text-sm"
      />
    );
  }
}

namespace Internal {
  export function Lockup({ className, logo, name, byline }: { className?: string; logo: string; name: string; byline: string }) {
    return (
      <div className={clsx("flex flex-col items-center", className)}>
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className={logo} />
          <span className={clsx("font-extrabold tracking-tight text-c-dark-full", name)}>Notas</span>
        </div>
        <span className={clsx("text-c-dark-half", byline)}>
          by <Byline />
        </span>
      </div>
    );
  }

  function Byline() {
    return (
      <a
        href="https://www.butterhost.ing"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold text-c-dark-full underline decoration-c-brand decoration-2 underline-offset-[3px] hover:decoration-c-dark-full"
      >
        Butterhost.ing
      </a>
    );
  }
}
