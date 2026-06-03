import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-BFkfXMES.js";import{s as r}from"./helpers-C2NRM0of.js";import{t as i}from"./sx-aware-component-D81CJTe4.js";import{n as a,r as o,t as s}from"./sx-aware-text-vYcgUUCk.js";import{i as c,n as l,r as u,t as d}from"./sx-branchy-box-CKn_bIbN.js";n();var f=e(),p=t(i)`
  color: #bf4f74;
  font-weight: bold;
`,m=t(i)`
  @media print {
    display: block;
  }
`,h=t(c)`
  @media print {
    display: block;
  }
`,g=t(u)`
  @media print {
    display: block;
  }
`,_=t(l)`
  @media print {
    display: block;
  }
`,v=t(i)`
  @media print {
    display: ${e=>e.printDisplay};
  }
`,y=t(i)`
  &:hover {
    @media (hover: hover) {
      background-color: orange;
    }
  }
`,b=t(d)`
  @media print {
    display: block;
  }
`,x=t(i)`
  color: white;
`,S=t(i)`
  background-color: #fef3c7;
`,C=t(i)`
  color: ${e=>e.active?`green`:`gray`};
`,w=t(i)`
  color: red;
`,T=t(i).attrs({type:`button`})`
  display: inline-flex;
  background-color: ${e=>e.$open?`#dbeafe`:`#f8fafc`};
`,E=t(i)`
  color: #14532d;
  ${r(!0)};
`,D=t(o)`
  color: navy;
  line-height: 20px;
`,O=t(o)`
  min-width: var(--column-width);
  flex-shrink: 0;
`,k=t(s)`
  margin-left: 4px;
  color: #2563eb;
`,A=t(a)`
  align-items: center;
  min-width: 24px;
`,j=t(i)`
  border-color: #c084fc;
`,M=t(j)`
  background-color: #f5f3ff;
`,N=t(j)`
  color: #4c1d95;
`,P=t(j)`
  color: #6d28d9;
`,F=t(j)`
  color: #7c3aed;
`,I=t(j)`
  color: #9333ea;
`,L=t(j)`
  color: #a855f7;
`,R=t(j)`
  color: #c084fc;
`,z=t(j)`
  color: #d8b4fe;
`,B=t(j)`
  color: #e9d5ff;
`,V=t(j)`
  color: #f3e8ff;
`,H=t(j)`
  color: #581c87;
`,U={caller:{kMnn75:`xujl8zx`,$$css:!0}},W={"--column-width":`96px`,display:`flex`,gap:8,padding:8},G=()=>(0,f.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,f.jsx)(p,{children:`Default`}),(0,f.jsx)(p,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,f.jsx)(p,{sx:U.caller,children:`Caller sx`}),(0,f.jsx)(m,{children:`Print display`}),(0,f.jsx)(h,{children:`Default export print`}),(0,f.jsx)(g,{children:`Default identifier print`}),(0,f.jsx)(_,{children:`Directory import print`}),(0,f.jsx)(v,{printDisplay:`block`,children:`Dynamic print display`}),(0,f.jsx)(y,{children:`Hover media`}),(0,f.jsx)(b,{children:`Nested sx scope`}),(0,f.jsx)(x,{children:`Primary 1`}),(0,f.jsx)(x,{children:`Primary 2`}),(0,f.jsx)(S,{sx:U.caller,children:`Inlined with caller sx`}),(0,f.jsx)(C,{active:!0,children:`Active forwarded`}),(0,f.jsx)(C,{children:`Inactive forwarded`}),(0,f.jsx)(w,{children:`Exported`}),(0,f.jsx)(w,{sx:U.caller,children:`Exported with caller sx`}),(0,f.jsx)(T,{$open:!0,sx:U.caller,children:`Exported toggle`}),(0,f.jsx)(E,{sx:U.caller,children:`Draggable sx`}),(0,f.jsx)(D,{size:`md`,children:`Generic Text`}),(0,f.jsx)(k,{color:`currentColor`,"aria-label":`Imported icon`}),(0,f.jsx)(A,{delay:100,children:`Imported tooltip`}),(0,f.jsx)(M,{sx:U.caller,children:`Interface wrapper`}),(0,f.jsx)(P,{sx:U.caller,children:`Imported type wrapper`}),(0,f.jsx)(F,{sx:U.caller,children:`Imported interface wrapper`}),(0,f.jsx)(I,{sx:U.caller,children:`Namespace type wrapper`}),(0,f.jsx)(L,{sx:U.caller,children:`Namespace interface wrapper`}),(0,f.jsx)(R,{sx:U.caller,children:`Barrel type wrapper`}),(0,f.jsx)(z,{sx:U.caller,children:`Default imported type wrapper`}),(0,f.jsx)(B,{sx:U.caller,children:`Default barrel type wrapper`}),(0,f.jsx)(V,{sx:U.caller,children:`Local default type wrapper`}),(0,f.jsx)(N,{sx:U.caller,children:`Explicit wrapper`}),(0,f.jsx)(H,{children:`Omit sx wrapper`}),(0,f.jsxs)(`div`,{style:W,children:[(0,f.jsx)(O,{color:`labelMuted`,children:`ABC-123`}),(0,f.jsx)(`span`,{children:`Item title`})]})]});export{G as App,E as DraggableSxButton,w as ExportedAccentButton,T as ExportedToggleButton};