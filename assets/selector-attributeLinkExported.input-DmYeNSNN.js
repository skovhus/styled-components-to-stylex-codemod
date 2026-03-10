import{j as e,c as n}from"./index-8gCVGeqV.js";const t=n.a`
  color: #bf4f74;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }

  &[target="_blank"]::after {
    content: " ↗";
    font-size: 0.8em;
  }

  &[href^="https"] {
    color: #4caf50;
  }

  &[href$=".pdf"] {
    color: #f44336;
  }
`;function o(){return e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:8,padding:16},children:[e.jsx(t,{href:"/page",children:"Internal"}),e.jsx(t,{href:"https://example.com",target:"_blank",children:"External HTTPS"}),e.jsx(t,{href:"/doc.pdf",children:"PDF Link"})]})}export{o as App,t as Link};
