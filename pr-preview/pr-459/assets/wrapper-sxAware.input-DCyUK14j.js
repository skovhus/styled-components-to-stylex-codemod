import{t as e}from"./jsx-runtime-B8sTdNyf.js";import"./stylex-vFXG5bjz.js";import{c as t}from"./index-xeSQFu8M.js";import{s as n}from"./helpers-Bmx8YCvz.js";import{t as r}from"./sx-aware-component-CHaXMIRx.js";import{t as i}from"./sx-aware-text-Dg281aGh.js";var a=e(),o=t(r)`
  color: #bf4f74;
  font-weight: bold;
`,s=t(r)`
  color: white;
`,c=t(r)`
  background-color: #fef3c7;
`,l=t(r)`
  color: ${e=>e.active?`green`:`gray`};
`,u=t(r)`
  color: red;
`,d=t(r).attrs({type:`button`})`
  display: inline-flex;
  background-color: ${e=>e.$open?`#dbeafe`:`#f8fafc`};
`,f=t(r)`
  color: #14532d;
  ${n(!0)};
`,p=t(i)`
  color: navy;
  line-height: 20px;
`,m={caller:{kMnn75:`xujl8zx`,$$css:!0}},h=()=>(0,a.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,a.jsx)(o,{children:`Default`}),(0,a.jsx)(o,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,a.jsx)(o,{sx:m.caller,children:`Caller sx`}),(0,a.jsx)(s,{children:`Primary 1`}),(0,a.jsx)(s,{children:`Primary 2`}),(0,a.jsx)(c,{sx:m.caller,children:`Inlined with caller sx`}),(0,a.jsx)(l,{active:!0,children:`Active forwarded`}),(0,a.jsx)(l,{children:`Inactive forwarded`}),(0,a.jsx)(u,{children:`Exported`}),(0,a.jsx)(u,{sx:m.caller,children:`Exported with caller sx`}),(0,a.jsx)(d,{$open:!0,sx:m.caller,children:`Exported toggle`}),(0,a.jsx)(f,{sx:m.caller,children:`Draggable sx`}),(0,a.jsx)(p,{size:`md`,children:`Generic Text`})]});export{h as App,f as DraggableSxButton,u as ExportedAccentButton,d as ExportedToggleButton};