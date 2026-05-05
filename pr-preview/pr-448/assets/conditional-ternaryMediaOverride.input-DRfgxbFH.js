import{c as e,p as t}from"./index-Btu-jASD.js";import{l as n,v as r}from"./helpers-BCIRv6-K.js";var i=t(),a=e.div`
  font-size: ${e=>e.$size===`large`?n(`large`):n(`small`)};
  ${r.phone} {
    font-size: ${e=>e.$size===`large`?n(`medium`):n(`small`)};
  }
  font-weight: 500;
  color: #333;
`,o=e.label`
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