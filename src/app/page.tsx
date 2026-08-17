import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Marquee } from "@/components/landing/Marquee";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ApiSection } from "@/components/landing/ApiSection";
import { Pricing } from "@/components/landing/Pricing";
import { CtaSection } from "@/components/landing/CtaSection";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <Marquee />
        <Features />
        <HowItWorks />
        <ApiSection />
        <Pricing />
        <CtaSection />
      </main>
      <Footer />
    </>
  );
}
