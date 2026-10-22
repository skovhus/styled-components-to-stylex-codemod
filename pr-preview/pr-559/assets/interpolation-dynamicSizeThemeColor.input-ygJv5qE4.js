import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{t}from"./react-lJqMpIaC.js";import{i as n}from"./styled-components.browser.esm-Dy4oaG3m.js";import{a as r}from"./helpers-daleu_Aj.js";t();var i=e();function a({name:e,size:t=16,className:n,style:r}){return(0,i.jsx)(l,{$size:t,className:n,style:r,children:e.slice(0,1).toUpperCase()})}function o({name:e,size:t=24,className:n,sx:r}){return(0,i.jsx)(l,{$size:t,className:n,sx:r,children:e.slice(0,1).toUpperCase()})}function s({name:e,size:t=28,className:n}){let r=e.slice(0,1).toUpperCase();return(0,i.jsx)(l,{$size:t,className:n,children:r})}var c=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,gap:8,alignItems:`center`},children:[(0,i.jsx)(a,{name:`Alice`,size:32}),(0,i.jsx)(a,{name:`Bob`,size:48}),(0,i.jsx)(a,{name:`Charlie`}),(0,i.jsx)(o,{name:`Dora`}),(0,i.jsx)(s,{name:`Eve`})]}),l=n.div`
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