import{t as e}from"./jsx-runtime-CF8L0Gwd.js";import{i as t}from"./styled-components.browser.esm-Dy4oaG3m.js";import{u as n,x as r}from"./helpers-daleu_Aj.js";var i=e(),a=t.div`
  font-size: ${e=>e.$size===`large`?n(`large`):n(`small`)};
  ${r.phone} {
    font-size: ${e=>e.$size===`large`?n(`medium`):n(`small`)};
  }
  font-weight: 500;
  color: #333;
`,o=t.label`
  display: flex;
  padding: 16px;
  border-width: 1px;
  border-style: solid;
  border-color: ${e=>e.checked?`#0066cc`:`#ccc`};
  border-radius: 6px;
  cursor: ${e=>e.disabled?`not-allowed`:`pointer`};

  &:hover {
    border-color: ${e=>e.disabled?`#ddd`:e.checked?`#0044aa`:`#999`};
  }
`;function s(){return(0,i.jsxs)(`div`,{style:{display:`flex`,flexDirection:`column`,gap:16,padding:16},children:[(0,i.jsx)(a,{children:`Default Title`}),(0,i.jsx)(a,{$size:`large`,children:`Large Title`}),(0,i.jsx)(a,{$size:`small`,children:`Small Title`}),(0,i.jsx)(o,{checked:!1,children:(0,i.jsx)(`span`,{children:`Unchecked`})}),(0,i.jsx)(o,{checked:!0,children:(0,i.jsx)(`span`,{children:`Checked`})}),(0,i.jsx)(o,{checked:!0,disabled:!0,children:(0,i.jsx)(`span`,{children:`Checked Disabled`})}),(0,i.jsx)(o,{checked:!1,disabled:!0,children:(0,i.jsx)(`span`,{children:`Unchecked Disabled`})})]})}export{s as App};