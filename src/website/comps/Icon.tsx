import { ComponentProps, ReactNode } from "react";

type Props = ComponentProps<"svg">;

export namespace Icon {
  function svg(children: ReactNode, fill = false) {
    return ({ className = "size-4", ...props }: Props) => (
      <svg
        viewBox="0 0 20 20"
        fill={fill ? "currentColor" : "none"}
        stroke={fill ? "none" : "currentColor"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={className}
        {...props}
      >
        {children}
      </svg>
    );
  }

  function text(label: string) {
    return svg(
      <text x="10" y="14.5" textAnchor="middle" fontSize="11" fontWeight="600" fill="currentColor" stroke="none" fontFamily="system-ui">
        {label}
      </text>,
    );
  }

  export const Text = text("T");
  export const H1 = text("H1");
  export const H2 = text("H2");
  export const H3 = text("H3");
  export const Bullet = svg(
    <>
      <circle cx="4.5" cy="6" r="1" fill="currentColor" />
      <circle cx="4.5" cy="14" r="1" fill="currentColor" />
      <path d="M8 6h9M8 14h9" />
    </>,
  );
  export const Numbered = svg(
    <>
      <text x="4.5" y="8" textAnchor="middle" fontSize="6" fill="currentColor" stroke="none" fontFamily="system-ui">
        1
      </text>
      <text x="4.5" y="16" textAnchor="middle" fontSize="6" fill="currentColor" stroke="none" fontFamily="system-ui">
        2
      </text>
      <path d="M8 6h9M8 14h9" />
    </>,
  );
  export const Todo = svg(
    <>
      <rect x="2.5" y="3.5" width="5" height="5" rx="1" />
      <path d="m3.8 13.8 1.4 1.4 2.3-2.7M10 6h7M10 14h7" />
    </>,
  );
  export const Toggle = svg(<path d="M4 4.5 8 7l-4 2.5zM4 11.5 8 14l-4 2.5zM10.5 7H17M10.5 14H17" />);
  export const Quote = svg(<path d="M4 4v12M8 6h8M8 10h8M8 14h5" />);
  export const Callout = svg(
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="2" />
      <path d="M6 8h8M6 12h5" />
    </>,
  );
  export const Divider = svg(<path d="M3 10h14" />);
  export const Code = svg(<path d="m7 6-4 4 4 4M13 6l4 4-4 4" />);
  export const Table = svg(
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <path d="M2.5 8h15M2.5 12.5h15M8 8v8.5" />
    </>,
  );
  export const Image = svg(
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <circle cx="7" cy="8" r="1.5" />
      <path d="m3 15 4.5-4.5 3 3 2.5-2.5 4.5 4.5" />
    </>,
  );
  export const Video = svg(
    <>
      <rect x="2.5" y="4" width="15" height="12" rx="2" />
      <path d="M8.5 7.5v5l4-2.5z" fill="currentColor" />
    </>,
  );
  export const Audio = svg(<path d="M3 8v4h3l4 3.5v-11L6 8zM13 7.5a3.5 3.5 0 0 1 0 5M15 5a7 7 0 0 1 0 10" />);
  export const File = svg(<path d="m13.5 8.5-5 5a2.1 2.1 0 0 1-3-3l6-6a3.5 3.5 0 0 1 5 5l-6.5 6.5a5 5 0 0 1-7-7l5-5" />);
  export const Embed = svg(
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <path d="M2.5 7h15M8 10l-2 2 2 2M12 10l2 2-2 2" />
    </>,
  );
  export const Contents = svg(<path d="M3 5h14M6 10h11M6 15h11M3 10h.01M3 15h.01" />);
  export const Page = svg(
    <>
      <path d="M5 2.5h6.5L15.5 6.5v11h-10.5z" />
      <path d="M11 2.5v4.5h4.5M7.5 11h5M7.5 14h5" />
    </>,
  );
  export const Plus = svg(<path d="M10 4v12M4 10h12" />);
  export const Grip = svg(
    <>
      {[5, 10, 15].flatMap((y) => [7, 13].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" />))}
    </>,
    true,
  );
  export const Chevron = svg(<path d="m8 5.5 4.5 4.5L8 14.5" />);
  export const More = svg(
    <>
      {[5, 10, 15].map((x) => (
        <circle key={x} cx={x} cy="10" r="1.3" />
      ))}
    </>,
    true,
  );
  export const Trash = svg(<path d="M4 6h12M8 6V4h4v2M5.5 6l.8 10h7.4l.8-10" />);
  export const Columns = svg(
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <path d="M10 3.5v13" />
    </>,
  );
  export const Tabs = svg(
    <>
      <path d="M2.5 7.5h15v9h-15zM2.5 7.5V4.5h5v3M7.5 4.5h5v3" />
    </>,
  );
  export const Monitor = svg(
    <>
      <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
      <path d="M7 16.5h6M10 13.5v3" />
    </>,
  );
  export const Sun = svg(
    <>
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" />
    </>,
  );
  export const Moon = svg(<path d="M16 12.2A6.5 6.5 0 0 1 7.8 4a6.5 6.5 0 1 0 8.2 8.2z" />);
  export const Logout = svg(<path d="M8 3.5H5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 5 16.5h3M13 6.5l3.5 3.5-3.5 3.5M16.5 10H8" />);
  export const Search = svg(
    <>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="m12.5 12.5 4 4" />
    </>,
  );
  export const Restore = svg(<path d="M4 9a6 6 0 1 1 1.8 4.3M4 4v5h5" />);
  export const Download = svg(<path d="M10 3.5v9M6 9l4 4 4-4M4 16.5h12" />);
  export const Smile = svg(
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M7 12a4 4 0 0 0 6 0M7.5 8h.01M12.5 8h.01" />
    </>,
  );
  export const Link = svg(<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.5-2.5a3 3 0 0 0-4.2-4.2l-.8.8M11.5 8.5a3 3 0 0 0-4.2 0L4.8 11a3 3 0 0 0 4.2 4.2l.8-.8" />);
}
