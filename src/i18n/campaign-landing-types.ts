import type { CampaignLandingDemoCopy } from "./campaign-landing-demo";

export type CampaignLandingCopy = {
  demo: CampaignLandingDemoCopy;
  nav: { product: string; mcp: string; faq: string; login: string; start: string; dashboard: string; menu: string };
  eyebrow: string;
  headline: string;
  headlineAccent: string;
  intro: string;
  primaryCta: string;
  secondaryCta: string;
  heroNote: string;
  audienceLabel: string;
  audiences: [string, string, string];
  preview: {
    label: string; title: string; period: string; days: [string, string, string];
    impressions: string; engagement: string; followers: string; accounts: string;
    chartDescription: string; chartStart: string; chartEnd: string;
    topicLabel: string; topic: string; aiLabel: string;
    roles: [string, string, string]; drafts: [string, string, string];
    ready: string; reviewLabel: string; individual: string; bulk: string;
    individualNote: string; bulkNote: string;
  };
  workflow: { eyebrow: string; title: string; intro: string; steps: [{ title: string; body: string }, { title: string; body: string }, { title: string; body: string }] };
  mcp: { eyebrow: string; title: string; intro: string; cta: string; prompt: string; response: string; steps: [string, string, string]; note: string };
  faqTitle: string;
  faqs: [{ question: string; answer: string }, { question: string; answer: string }, { question: string; answer: string }];
  closing: { title: string; body: string; cta: string };
  footerNote: string;
};
