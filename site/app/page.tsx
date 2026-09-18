import { Hero } from "@/components/hero/Hero";
import { DemoSection } from "@/components/demo/DemoSection";
import { Verdicts } from "@/components/sections/Verdicts";
import { Features } from "@/components/sections/Features";
import { MascotShowcase } from "@/components/sections/MascotShowcase";
import { Privacy } from "@/components/sections/Privacy";
import { Install } from "@/components/sections/Install";
import { Faq } from "@/components/sections/Faq";
import { Footer } from "@/components/sections/Footer";

export default function Home() {
  return (
    <>
      <main>
        <Hero />
        <DemoSection />
        <Verdicts />
        <Features />
        <MascotShowcase />
        <Privacy />
        <Install />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
