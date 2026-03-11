import{j as d,c as a}from"./index-tVyTGtNC.js";const p=a.div`
  border-radius: 8px;
  border: 1px solid #ccc;
  ${i=>i.$compact?`
    padding: 8px;
    font-size: 12px;
    @media (min-width: 768px) {
      padding: 12px;
    }
  `:`
    padding: 16px;
    font-size: 14px;
    @media (min-width: 768px) {
      padding: 24px;
    }
  `};
`;function t(){return d.jsxs("div",{style:{display:"flex",gap:16,padding:16},children:[d.jsx(p,{$compact:!0,children:"Compact Card"}),d.jsx(p,{$compact:!1,children:"Regular Card"})]})}export{t as App,p as Card};
