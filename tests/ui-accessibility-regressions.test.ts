import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../src/app/globals.css',import.meta.url),'utf8');
function rgb(hex:string){return hex.replace('#','').match(/../g)!.map(value=>parseInt(value,16)/255);}
function mix(fg:number[],bg:number[],opacity:number){return fg.map((value,index)=>value*opacity+bg[index]*(1-opacity));}
function luminance(color:number[]){return color.map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);}
function contrast(a:number[],b:number[]){const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return(values[0]+0.05)/(values[1]+0.05);}
test('destructive text remains readable on cards, tinted buttons and badges',()=>{
 const light=css.split(':root {')[1].split('}')[0];
 const token=(name:string)=>rgb(new RegExp('--'+name+':\\s*(#[0-9a-f]{6})','i').exec(light)![1]);
 const destructive=token('destructive'),card=token('card');
 expect(contrast(mix(destructive,card,0.9),card)).toBeGreaterThanOrEqual(4.5);
 for(const opacity of [0.1,0.2])expect(contrast(destructive,mix(destructive,card,opacity))).toBeGreaterThanOrEqual(4.5);
});
