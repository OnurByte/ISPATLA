import { Children, cloneElement, isValidElement, type ReactNode } from "react";
import { BrandMark } from '@/components/brand-logo';

/** Inline prose uses the same mark and canonical domain as the navigation. */
export function BrandText({ text }: { text: string }) {
  return <span>{text.split(/(?<![\w@/:.])(ispatla\.tr)(?![\w/.])/g).map((part,index) => part === 'ispatla.tr'
    ? <span key={index} className="inline-flex items-center gap-1 whitespace-nowrap align-[-0.125em] normal-case tracking-normal"><BrandMark size={14} />ispatla.tr</span>
    : part)}</span>;
}


export function brandProse(node: ReactNode): ReactNode {
  if (typeof node === 'string') return node.includes('ispatla.tr') ? <BrandText text={node} /> : node;
  if (Array.isArray(node)) return Children.map(node, brandProse);
  if (!isValidElement<{children?:ReactNode}>(node) || typeof node.type !== 'string' || ['pre','code','script','textarea'].includes(node.type)) return node;
  return node.props.children === undefined ? node : cloneElement(node, undefined, Children.map(node.props.children, brandProse));
}
