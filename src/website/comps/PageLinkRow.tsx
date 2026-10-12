import { Page } from "@/models/Page";
import { Link } from "react-router";
import { Route } from "../Route";
import { Icon } from "./Icon";

export function PageLinkRow({ page }: { page: Pick<Page.Summary, "id" | "icon" | "title"> }) {
  return (
    <Link to={Route.page(page.id)} className="flex items-center gap-1.5 rounded px-0.5 py-1 font-medium no-underline hover:bg-c-hover">
      {page.icon ? <span className="w-5 text-center">{page.icon}</span> : <Icon.Page className="size-5 text-c-dark-half" />}
      <span className="underline decoration-c-dark-half/40 underline-offset-2">{page.title || "Untitled"}</span>
    </Link>
  );
}
