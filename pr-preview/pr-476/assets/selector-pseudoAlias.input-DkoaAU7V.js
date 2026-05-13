import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,d as n,p as r}from"./index-4FhNCLj1.js";import{h as i}from"./helpers-BCh9tF3z.js";r();var a=e(),o=t.button`
  padding: 8px 16px;
  background-color: #f0f0f0;
  color: #333;

  &:${i} {
    background-color: #e0e0e0;
    color: #111;
  }
`,s=t.button`
  padding: 8px 16px;
  background-color: #f8c8dc;
  color: #333;

  &:${i} {
    background: none;
    color: #111;
  }
`,c=t.div`
  padding: 12px;
  border-radius: 6px;
  background-color: #f8fafc;

  ${e=>e.$interactive?n`
          cursor: pointer;

          &:${i} {
            background-color: #e0f2fe;
          }
        `:void 0}
`;function l(){return(0,a.jsxs)(`div`,{style:{display:`flex`,gap:16,padding:16},children:[(0,a.jsx)(o,{children:`Default`}),(0,a.jsx)(o,{children:`Hover me`}),(0,a.jsx)(s,{children:`Reset background`}),(0,a.jsx)(c,{$interactive:!0,children:`Interactive card`})]})}export{l as App};