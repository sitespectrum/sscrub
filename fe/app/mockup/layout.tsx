import "./mockup.css";

export default function MockupLayout({ children }: LayoutProps<"/mockup">) {
  return <div className="nle flex-1 flex flex-col">{children}</div>;
}
