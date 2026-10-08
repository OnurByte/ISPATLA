"use client";
import type { PointerEvent } from "react";
import {ArrowUpRight,Code2} from "lucide-react";
import styles from "./creator-card.module.css";

export function CreatorCard(){
  function reset(event:PointerEvent<HTMLElement>){
    for(const key of ["--tilt-x","--tilt-y","--spot-x","--spot-y"])event.currentTarget.style.removeProperty(key);
  }
  function move(event:PointerEvent<HTMLElement>){
    if(event.pointerType!=="mouse"||window.matchMedia("(prefers-reduced-motion: reduce), (hover: none), (pointer: coarse)").matches)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const x=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
    const y=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
    const style=event.currentTarget.style;
    style.setProperty("--tilt-x",`${(0.5-y)*12}deg`);style.setProperty("--tilt-y",`${(x-0.5)*12}deg`);
    style.setProperty("--spot-x",`${x*100}%`);style.setProperty("--spot-y",`${y*100}%`);
  }
  return <article className={`${styles.card} rounded-2xl border border-[#476a54] bg-[#143a2c] p-7 text-[#f7f3e8] shadow-[0_24px_70px_-40px_rgba(20,58,44,.75)] sm:p-9`} onPointerMove={move} onPointerLeave={reset}>
    <div className={styles.content}>
      <div className="mb-8 flex items-center justify-between"><span className="text-xs font-medium uppercase tracking-[.18em] text-[#c8d7c9]">İSPATLA · açık geliştirme</span><Code2 className="size-5 text-[#f08a70]" aria-hidden="true"/></div>
      <p className="text-3xl font-semibold tracking-tight">OnurByte<span className="text-[#f08a70]">.</span></p>
      <p className="mt-2 text-sm text-[#c8d7c9]">@OnurStirner</p>
      <p className="mt-6 max-w-sm text-sm leading-6 text-[#e1e8dc]">Sinyal, karar ve sonucu aynı masada görmek için. Yerel kurulum, incelenebilir kaynak kodu ve AGPL-3.0-or-later lisansı.</p>
      <div className="mt-7 flex flex-wrap gap-4 text-sm">
        <a className="inline-flex min-h-11 items-center gap-1 underline decoration-[#f08a70] underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" href="https://github.com/OnurByte/Ispatla" target="_blank" rel="noreferrer">GitHub <ArrowUpRight className="size-4" aria-hidden="true"/></a>
        <a className="inline-flex min-h-11 items-center gap-1 underline decoration-[#f08a70] underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4" href="https://x.com/OnurStirner" target="_blank" rel="noreferrer">X <ArrowUpRight className="size-4" aria-hidden="true"/></a>
      </div>
    </div>
  </article>;
}
