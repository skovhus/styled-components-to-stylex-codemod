import"./chunk-jRWAZmH_.js";import{c as e,d as t,m as n,p as r}from"./index-CAZQsAq0.js";import{h as i}from"./helpers-DaFGcBsd.js";n();var a=r(),o=e.button`
  padding: 8px 16px;
  background-color: #f0f0f0;
  color: #333;

  &:${i} {
    background-color: #e0e0e0;
    color: #111;
  }
`,s=e.button`
  padding: 8px 16px;
  background-color: #f8c8dc;
  color: #333;

  &:${i} {
    background: none;
    color: #111;
  }
`,c=e.div`
  padding: 12px;
  border-radius: 6px;
  background-color: #f8fafc;

  ${e=>e.$interactive?t`
          cursor: pointer;

          &:${i} {
            background-color: #e0f2fe;
          }
        `:void 0}
`;function l(){return(0,a.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,a.jsx)(o,{children:`Default`}),(0,a.jsx)(o,{children:`Hover me`}),(0,a.jsx)(s,{children:`Reset background`}),(0,a.jsx)(c,{$interactive:!0,children:`Interactive card`})]})}export{l as App};