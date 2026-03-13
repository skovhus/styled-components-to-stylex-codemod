import{j as i,c as l}from"./index-BQdwjWgG.js";import{c as r}from"./helpers-AI-s5N_u.js";function t({name:e,size:s=16,className:n,style:o}){return i.jsx(a,{$size:s,className:n,style:o,children:e.slice(0,1).toUpperCase()})}const m=()=>i.jsxs("div",{style:{display:"flex",gap:8,alignItems:"center"},children:[i.jsx(t,{name:"Alice",size:32}),i.jsx(t,{name:"Bob",size:48}),i.jsx(t,{name:"Charlie"})]}),a=l.div`
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: ${e=>e.$size}px;
  height: ${e=>e.$size}px;

  background-color: ${r("labelMuted")};
  color: ${e=>e.theme.isDark?e.theme.color.bgSub:e.theme.color.bgBase};

  font-size: ${e=>Math.round(e.$size*(2/3))}px;
  line-height: ${e=>e.$size}px;
  text-align: center;
`;export{m as App,t as Initials};
