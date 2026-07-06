"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

const ESTAGIOS = [
  {
    n: 1,
    titulo: "Captação",
    desc: "Leads de WhatsApp, redes, balcão e indicação entram no CRM e são qualificados.",
    href: "/captacao",
  },
  {
    n: 2,
    titulo: "Matrícula",
    desc: "Plano → cadastro → Asaas → link de pagamento no WhatsApp → webhook confirma.",
    href: "/matricula",
  },
  {
    n: 3,
    titulo: "Cobrança",
    desc: "Avisos de vencimento, inadimplência e renovação de planos a expirar.",
    href: "/cobranca",
  },
  {
    n: 4,
    titulo: "Retenção",
    desc: "Monitora presença e reativa ausentes em 7, 14 e 21 dias.",
    href: "/retencao",
  },
];

export function FluxogramaHero() {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

      tl.from("[data-hero-eyebrow]", { opacity: 0, y: 12, duration: 0.5 })
        .from("[data-hero-title] span", {
          opacity: 0,
          y: 28,
          duration: 0.7,
          stagger: 0.08,
        }, "-=0.2")
        .from("[data-hero-sub]", { opacity: 0, y: 16, duration: 0.5 }, "-=0.3")
        .from("[data-hero-cta]", { opacity: 0, y: 14, duration: 0.4 }, "-=0.2");

      // pipeline: cada estágio revela e em seguida "desenha" o conector
      const cards = gsap.utils.toArray<HTMLElement>("[data-stage]");
      cards.forEach((card, i) => {
        tl.from(
          card,
          { opacity: 0, y: 22, duration: 0.45 },
          i === 0 ? "-=0.1" : "<+=0.15",
        ).from(
          card.querySelector("[data-plate]"),
          { scale: 0.5, opacity: 0, duration: 0.4, ease: "back.out(2.2)" },
          "<",
        );

        const connector = card.querySelector<HTMLElement>("[data-connector]");
        if (connector) {
          tl.fromTo(
            connector,
            { scaleX: 0 },
            { scaleX: 1, duration: 0.35, ease: "none" },
            "-=0.05",
          );
        }
      });
    },
    { scope: root },
  );

  return (
    <div ref={root} className="mx-auto max-w-6xl px-6 py-16 lg:py-24">
      {/* banner hero — placeholder com a headline sobreposta na metade direita */}
      <div
        data-hero-banner
        className="relative min-h-[380px] overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-surface-2 via-surface to-black lg:min-h-[460px]"
      >
        {/* imagem de fundo do banner */}
        <Image
          src="/banner-hero-v2.png"
          alt="Academia Coliseu Team"
          fill
          priority
          sizes="100vw"
          className="object-cover object-left"
        />

        {/* conteúdo sobreposto, restrito à metade direita e justificado à direita */}
        <div className="relative flex min-h-[380px] items-center justify-end p-8 lg:min-h-[460px] lg:p-12">
          <div className="w-1/2 max-w-[50%] text-left">
            <p
              data-hero-eyebrow
              className="text-xs font-semibold uppercase tracking-[0.25em] text-red-bright"
            >
              Academia Coliseu Team
            </p>

            <h1
              data-hero-title
              className="mt-4 font-display text-5xl font-bold uppercase leading-[0.95] tracking-wide text-ink sm:text-6xl lg:text-7xl"
            >
              <span className="block">Sistema Coliseu</span>
              <span className="block text-red-bright">SBC</span>
            </h1>

            <p data-hero-sub className="mr-auto mt-5 text-base text-muted">
              Captação, matrícula, cobrança, renovação e retenção — integradas
              com Asaas e WhatsApp, num pipeline único de quatro estágios.
            </p>

            <div data-hero-cta className="mt-7 flex flex-wrap justify-start gap-3">
              <Link
                href="/painel"
                className="rounded-lg bg-red px-5 py-3 font-display text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-red-bright"
              >
                Abrir painel
              </Link>
              <Link
                href="/captacao"
                className="rounded-lg border border-border-strong px-5 py-3 font-display text-sm font-semibold uppercase tracking-widest text-muted transition-colors hover:text-ink"
              >
                Ver o funil
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* pipeline animado */}
      <div className="mt-16 flex flex-col gap-0 lg:flex-row lg:items-stretch">
        {ESTAGIOS.map((e, i) => (
          <div
            key={e.n}
            data-stage
            className="relative flex-1 lg:flex lg:items-center"
          >
            <Link
              href={e.href}
              className="group block w-full rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-plate)] transition-colors hover:border-red/40 hover:bg-surface-2"
            >
              <span
                data-plate
                className="steel-plate mb-4 h-11 w-11 rounded-md text-xl"
              >
                {e.n}
              </span>
              <h3 className="font-display text-2xl font-semibold uppercase tracking-wide text-ink">
                {e.titulo}
              </h3>
              <p className="mt-1.5 text-sm text-muted">{e.desc}</p>
              <span className="mt-3 inline-block text-xs font-semibold uppercase tracking-widest text-red-bright opacity-0 transition-opacity group-hover:opacity-100">
                Acessar →
              </span>
            </Link>

            {/* conector animado entre estágios */}
            {i < ESTAGIOS.length - 1 && (
              <div
                data-connector
                className="z-0 mx-auto my-1 h-6 w-px origin-top bg-gradient-to-b from-red to-red-deep lg:mx-1 lg:my-0 lg:h-px lg:w-8 lg:origin-left lg:bg-gradient-to-r"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
