import { expect, test } from "bun:test";

test("GA consent lifecycle gates scripts, events, routes and cross-tab withdrawal", () => {
  const result = Bun.spawnSync({ cmd: [process.execPath, "-e", `
    import { mock } from 'bun:test';
    import assert from 'node:assert/strict';
    import * as React from 'react';
    const states = [], effects = [];
    let cursor = 0, pending = [], pathname = '/', tree;
    const equal = (a,b) => a && b && a.length === b.length && a.every((value,index) => Object.is(value,b[index]));
    mock.module('react', () => ({ ...React,
      useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
      useEffect(callback,deps) { const index = cursor++; if (!equal(effects[index]?.deps,deps)) pending.push(() => { effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: callback() }; }); }
    }));
    mock.module('next/navigation', () => ({ usePathname: () => pathname }));
    mock.module('next/script', () => ({ default: 'script' }));
    mock.module('next/link', () => ({ default: 'a' }));
    const listeners = new Map(), timers = new Map(), storage = new Map(), cookieWrites = [];
    let timerId = 0, storageBlocked = false;
    globalThis.window = { location: { origin: 'https://ispatla.tr', hostname: 'ispatla.tr', pathname: '/' },
      setTimeout(fn) { timers.set(++timerId,fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
      addEventListener(name,fn) { if (!listeners.has(name)) listeners.set(name,new Set()); listeners.get(name).add(fn); },
      removeEventListener(name,fn) { listeners.get(name)?.delete(fn); }
    };
    globalThis.document = { referrer: 'https://google.com/search?q=private#secret', get cookie() { return '_ga=one; session=private'; }, set cookie(value) { cookieWrites.push(value); } };
    globalThis.localStorage = { getItem(key) { if (storageBlocked) throw Error('blocked'); return storage.get(key) ?? null; }, setItem(key,value) { if (storageBlocked) throw Error('blocked'); storage.set(key,value); } };
    const { GoogleAnalytics } = await import('./src/components/google-analytics.tsx');
    const render = () => { cursor=0; pending=[]; tree=GoogleAnalytics({ measurementId:'G-ABC123' }); for (const effect of pending) effect(); return tree; };
    const find = (node,type) => Array.isArray(node) ? node.flatMap(n => find(n,type)) : !React.isValidElement(node) ? [] : [...(node.type === type ? [node] : []), ...find(node.props.children,type)];
    const click = label => { const button=find(tree,'button').find(n => n.props.children === label); assert.ok(button,label); button.props.onClick(); };
    const commands = () => (window.dataLayer || []).map(args => Array.from(args));
    const events = () => commands().filter(args => args[0] === 'event');
    const dispatch = (name,event) => { for (const listener of [...(listeners.get(name) || [])]) listener(event); };
    const measure = () => dispatch('ispatla:measurement',{ detail:{ event:'signup_complete',page:'/signup',source:'google' } });
    render();
    assert.equal(find(tree,'script').length,0); assert.equal(window.gtag,undefined);
    for (const fn of timers.values()) fn(); timers.clear(); render();
    assert.equal(find(tree,'script').length,0); assert.equal(window.gtag,undefined);
    click('Reject analytics'); render(); assert.equal(find(tree,'script').length,0); assert.equal(window.gtag,undefined);
    click('Analytics preferences'); render(); click('Accept analytics'); render();
    assert.equal(find(tree,'script').length,1); assert.equal(events().length,0);
    const delayedReady=find(tree,'script')[0].props.onReady;
    click('Withdraw analytics consent');
    assert.equal(window['ga-disable-G-ABC123'],true);
    delayedReady(); render(); assert.equal(events().length,0); assert.equal(find(tree,'script').length,0);
    click('Analytics preferences'); render(); click('Accept analytics'); render();
    assert.equal(events().length,1);
    assert.equal(listeners.get('ispatla:measurement').size,1);
    const params=events()[0][2]; assert.equal(params.page_location,'https://ispatla.tr/'); assert.equal(params.page_referrer,'https://google.com'); assert.equal(params.page_title,'/');
    assert.equal(JSON.stringify(commands()).includes('private'),false);
    measure(); assert.equal(events().at(-1)[1],'sign_up');
    const count=events().length;
    window.location.pathname='/settings'; measure(); assert.equal(events().length,count);
    pathname='/settings'; render(); assert.equal(window['ga-disable-G-ABC123'],true); assert.equal(listeners.get('ispatla:measurement').size,0);
    pathname='/'; window.location.pathname='/'; render();
    assert.equal(listeners.get('ispatla:measurement').size,1);
    const before=events().length;
    storage.set('ispatla:analytics-consent','rejected');
    dispatch('storage',{ key:'ispatla:analytics-consent',newValue:'rejected' });
    assert.equal(window['ga-disable-G-ABC123'],true); assert.ok(cookieWrites.some(value => value.includes('domain=.ispatla.tr')));
    measure(); assert.equal(events().length,before);
    render(); assert.equal(listeners.get('ispatla:measurement').size,0); assert.equal(find(tree,'script').length,0);
    storageBlocked=true; click('Analytics preferences'); render(); click('Accept analytics'); render();
    assert.equal(listeners.get('ispatla:measurement').size,1);
    click('Withdraw analytics consent'); render(); assert.equal(listeners.get('ispatla:measurement').size,0);
    for (const effect of effects) effect?.cleanup?.(); assert.equal(listeners.get('storage').size,0);
    console.log('consent lifecycle verified');
  `], cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  expect({ code: result.exitCode, stderr: result.stderr.toString() }).toEqual({ code: 0, stderr: "" });
  expect(result.stdout.toString()).toContain("consent lifecycle verified");
});
