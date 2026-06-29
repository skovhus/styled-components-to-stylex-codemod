import{t as e}from"./jsx-runtime-D4ePz0Hl.js";import{m as t,u as n}from"./index-BECO_UlF.js";import{a as r}from"./helpers-L2tV2ARE.js";t();var i=e();function a({name:e,size:t=16,className:n,style:r}){return(0,i.jsx)(l,{$size:t,className:n,style:r,children:e.slice(0,1).toUpperCase()})}function o({name:e,size:t=24,className:n,sx:r}){return(0,i.jsx)(l,{$size:t,className:n,sx:r,children:e.slice(0,1).toUpperCase()})}function s({name:e,size:t=28,className:n}){return(0,i.jsx)(l,{$size:t,className:n,children:e.slice(0,1).toUpperCase()})}var c=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:8,alignItems:`center`},children:[(0,i.jsx)(a,{name:`Alice`,size:32}),(0,i.jsx)(a,{name:`Bob`,size:48}),(0,i.jsx)(a,{name:`Charlie`}),(0,i.jsx)(o,{name:`Dora`}),(0,i.jsx)(s,{name:`Eve`})]}),l=n.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: ${e=>e.$size}px;
  height: ${e=>e.$size}px;

  background-color: ${r(`labelMuted`)};
  color: ${e=>e.theme.isDark?e.theme.color.bgSub:e.theme.color.bgBase};

  font-size: ${e=>Math.round(e.$size*(2/3))}px;
  line-height: ${e=>e.$size}px;
  text-align: center;
`;export{c as App,o as ExistingSxInitials,a as Initials,s as LocalSxNameInitials};