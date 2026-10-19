export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="pt-BR"><body style={{ fontFamily: "sans-serif", padding: 24 }}>{children}</body></html>;
}
