import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ApiSection } from "@/components/landing/ApiSection";
import { Pricing } from "@/components/landing/Pricing";
import { CtaSection } from "@/components/landing/CtaSection";
import { Footer } from "@/components/landing/Footer";

export default function Home() {
  return (
    <>
      <div aria-hidden className="bk-grain" />
      <Nav />
      <main>
        <Hero />
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
