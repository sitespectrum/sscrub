export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-app">{children}</div>
  );
}
