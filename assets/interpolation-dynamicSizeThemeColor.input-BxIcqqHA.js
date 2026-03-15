import{o as e}from"./chunk-zsgVPwQN.js";import{t}from"./react-D4cBbUL-.js";import{f as n,s as r}from"./index-Dda2rlA_.js";import{a as i}from"./helpers-BBikFZlV.js";e(t(),1);var a=n();function o({name:e,size:t=16,className:n,style:r}){return(0,a.jsx)(c,{$size:t,className:n,style:r,children:e.slice(0,1).toUpperCase()})}var s=()=>(0,a.jsxs)(`div`,{style:{display:`flex`,gap:8,alignItems:`center`},children:[(0,a.jsx)(o,{name:`Alice`,size:32}),(0,a.jsx)(o,{name:`Bob`,size:48}),(0,a.jsx)(o,{name:`Charlie`})]}),c=r.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: ${e=>e.$size}px;
  height: ${e=>e.$size}px;

  background-color: ${i(`labelMuted`)};
  color: ${e=>e.theme.isDark?e.theme.color.bgSub:e.theme.color.bgBase};

  font-size: ${e=>Math.round(e.$size*(2/3))}px;
  line-height: ${e=>e.$size}px;
  text-align: center;
`;export{s as App,o as Initials};