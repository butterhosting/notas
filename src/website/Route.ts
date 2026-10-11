export const Route = {
  home() {
    return "/";
  },
  workspace(id: string) {
    return `/w/${id}`;
  },
  page(id: string) {
    return `/p/${id}`;
  },
};
