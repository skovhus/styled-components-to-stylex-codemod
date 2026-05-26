import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{c as t,p as n}from"./index-DChdAXbv.js";import{s as r}from"./helpers-chCSX7KC.js";import{t as i}from"./sx-aware-component-DupKu49G.js";import{a,i as o,n as s,r as c,t as l}from"./sx-aware-text-pUAARlp9.js";n();var u=e(),d=t(i)`
  color: #bf4f74;
  font-weight: bold;
`,f=t(i)`
  @media print {
    display: block;
  }
`,p=t(a)`
  @media print {
    display: block;
  }
`,m=t(o)`
  @media print {
    display: block;
  }
`,h=t(i)`
  @media print {
    display: ${e=>e.printDisplay};
  }
`,g=t(i)`
  color: white;
`,_=t(i)`
  background-color: #fef3c7;
`,v=t(i)`
  color: ${e=>e.active?`green`:`gray`};
`,y=t(i)`
  color: red;
`,b=t(i).attrs({type:`button`})`
  display: inline-flex;
  background-color: ${e=>e.$open?`#dbeafe`:`#f8fafc`};
`,x=t(i)`
  color: #14532d;
  ${r(!0)};
`,S=t(c)`
  color: navy;
  line-height: 20px;
`,C=t(c)`
  min-width: var(--column-width);
  flex-shrink: 0;
`,w=t(l)`
  margin-left: 4px;
  color: #2563eb;
`,T=t(s)`
  align-items: center;
  min-width: 24px;
`,E=t(i)`
  border-color: #c084fc;
`,D=t(E)`
  background-color: #f5f3ff;
`,O=t(E)`
  color: #4c1d95;
`,k=t(E)`
  color: #6d28d9;
`,A=t(E)`
  color: #7c3aed;
`,j=t(E)`
  color: #9333ea;
`,M=t(E)`
  color: #a855f7;
`,N=t(E)`
  color: #c084fc;
`,P=t(E)`
  color: #d8b4fe;
`,F=t(E)`
  color: #e9d5ff;
`,I=t(E)`
  color: #f3e8ff;
`,L=t(E)`
  color: #581c87;
`,R={caller:{kMnn75:`xujl8zx`,$$css:!0}},z={"--column-width":`96px`,display:`flex`,gap:8,padding:8},B=()=>(0,u.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,u.jsx)(d,{children:`Default`}),(0,u.jsx)(d,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,u.jsx)(d,{sx:R.caller,children:`Caller sx`}),(0,u.jsx)(f,{children:`Print display`}),(0,u.jsx)(p,{children:`Default export print`}),(0,u.jsx)(m,{children:`Directory import print`}),(0,u.jsx)(h,{printDisplay:`block`,children:`Dynamic print display`}),(0,u.jsx)(g,{children:`Primary 1`}),(0,u.jsx)(g,{children:`Primary 2`}),(0,u.jsx)(_,{sx:R.caller,children:`Inlined with caller sx`}),(0,u.jsx)(v,{active:!0,children:`Active forwarded`}),(0,u.jsx)(v,{children:`Inactive forwarded`}),(0,u.jsx)(y,{children:`Exported`}),(0,u.jsx)(y,{sx:R.caller,children:`Exported with caller sx`}),(0,u.jsx)(b,{$open:!0,sx:R.caller,children:`Exported toggle`}),(0,u.jsx)(x,{sx:R.caller,children:`Draggable sx`}),(0,u.jsx)(S,{size:`md`,children:`Generic Text`}),(0,u.jsx)(w,{color:`currentColor`,"aria-label":`Imported icon`}),(0,u.jsx)(T,{delay:100,children:`Imported tooltip`}),(0,u.jsx)(D,{sx:R.caller,children:`Interface wrapper`}),(0,u.jsx)(k,{sx:R.caller,children:`Imported type wrapper`}),(0,u.jsx)(A,{sx:R.caller,children:`Imported interface wrapper`}),(0,u.jsx)(j,{sx:R.caller,children:`Namespace type wrapper`}),(0,u.jsx)(M,{sx:R.caller,children:`Namespace interface wrapper`}),(0,u.jsx)(N,{sx:R.caller,children:`Barrel type wrapper`}),(0,u.jsx)(P,{sx:R.caller,children:`Default imported type wrapper`}),(0,u.jsx)(F,{sx:R.caller,children:`Default barrel type wrapper`}),(0,u.jsx)(I,{sx:R.caller,children:`Local default type wrapper`}),(0,u.jsx)(O,{sx:R.caller,children:`Explicit wrapper`}),(0,u.jsx)(L,{children:`Omit sx wrapper`}),(0,u.jsxs)(`div`,{style:z,children:[(0,u.jsx)(C,{color:`labelMuted`,children:`ABC-123`}),(0,u.jsx)(`span`,{children:`Item title`})]})]});export{B as App,x as DraggableSxButton,y as ExportedAccentButton,b as ExportedToggleButton};