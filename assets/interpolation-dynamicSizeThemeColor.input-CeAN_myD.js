import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-CZ91Qxx2.js";import{a as r}from"./helpers-C_mLkWOI.js";n();var i=e();function a({name:e,size:t=16,className:n,style:r}){return(0,i.jsx)(s,{$size:t,className:n,style:r,children:e.slice(0,1).toUpperCase()})}var o=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:8,alignItems:`center`},children:[(0,i.jsx)(a,{name:`Alice`,size:32}),(0,i.jsx)(a,{name:`Bob`,size:48}),(0,i.jsx)(a,{name:`Charlie`})]}),s=t.div`
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
`;export{o as App,a as Initials};