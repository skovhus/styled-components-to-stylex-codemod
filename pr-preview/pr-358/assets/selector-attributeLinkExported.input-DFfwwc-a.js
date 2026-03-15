import"./react-D4cBbUL-.js";import{f as e,s as t}from"./index-GfnpIRuu.js";var n=e(),r=t.a`
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
`;function i(){return(0,n.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:8,padding:16},children:[(0,n.jsx)(r,{href:`/page`,children:`Internal`}),(0,n.jsx)(r,{href:`https://example.com`,target:`_blank`,children:`External HTTPS`}),(0,n.jsx)(r,{href:`/doc.pdf`,children:`PDF Link`})]})}export{i as App,r as Link};