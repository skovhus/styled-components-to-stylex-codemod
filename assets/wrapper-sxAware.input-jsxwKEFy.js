import"./stylex-vFXG5bjz.js";import{c as e,p as t}from"./index-DbDHYQIX.js";import{t as n}from"./sx-aware-component-DXliKzoZ.js";import{t as r}from"./sx-aware-text-BMYT3X95.js";var i=t(),a=e(n)`
  color: #bf4f74;
  font-weight: bold;
`,o=e(n)`
  color: white;
`,s=e(n)`
  background-color: #fef3c7;
`,c=e(n)`
  color: ${e=>e.active?`green`:`gray`};
`,l=e(n)`
  color: red;
`,u=e(r)`
  color: navy;
  line-height: 20px;
`,d={caller:{kMnn75:`xujl8zx`,$$css:!0}},f=()=>(0,i.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,i.jsx)(a,{children:`Default`}),(0,i.jsx)(a,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,i.jsx)(a,{sx:d.caller,children:`Caller sx`}),(0,i.jsx)(o,{children:`Primary 1`}),(0,i.jsx)(o,{children:`Primary 2`}),(0,i.jsx)(s,{sx:d.caller,children:`Inlined with caller sx`}),(0,i.jsx)(c,{active:!0,children:`Active forwarded`}),(0,i.jsx)(c,{children:`Inactive forwarded`}),(0,i.jsx)(l,{children:`Exported`}),(0,i.jsx)(l,{sx:d.caller,children:`Exported with caller sx`}),(0,i.jsx)(u,{size:`md`,children:`Generic Text`})]});export{f as App,l as ExportedAccentButton};