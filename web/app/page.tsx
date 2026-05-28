import {
  CTA,
  Compliance,
  Footer,
  Hero,
  Mechanism,
  Nav,
  Primitives,
  Vault,
  WhyFHE,
  ZamaBand,
} from "@/components/veil/sections";

export default function Home() {
  return (
    <>
      <Nav />
      <Hero />
      <Mechanism />
      <Primitives />
      <WhyFHE />
      <Vault />
      <Compliance />
      <ZamaBand />
      <CTA />
      <Footer />
    </>
  );
}
