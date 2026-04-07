import type { Metadata } from "next";
import { Playfair_Display, DM_Mono, Lato } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
});

const dmMono = DM_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

const lato = Lato({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

export const metadata: Metadata = {
  title: "Copy That | Website Copy Generator",
  description: "Generate professional website copy for your small business. Powered by AI, built by Bit Lore.",
  metadataBase: new URL("https://copy.bitlore.io"),
  openGraph: {
    title: "Copy That — AI Website Copy Generator",
    description: "Create a voice profile, generate copy in your brand's voice, and edit in a real-time workspace. Free to use.",
    url: "https://copy.bitlore.io",
    siteName: "Copy That",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Copy That — AI Website Copy Generator",
    description: "Create a voice profile, generate copy in your brand's voice, and edit in a real-time workspace.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${playfair.variable} ${dmMono.variable} ${lato.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
