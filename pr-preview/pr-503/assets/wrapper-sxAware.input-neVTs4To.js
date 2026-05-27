import{t as e}from"./jsx-runtime-B8sTdNyf.js";import{l as t,p as n}from"./index-BR42l6fp.js";import{c as r,s as i}from"./helpers-qvKl25LF.js";import{t as a}from"./sx-aware-component-URvTR1GT.js";import{a as o,c as s,i as c,n as l,o as u,r as d,s as f,t as p}from"./sx-aware-text-DWDRKpgt.js";n();var m=e(),h=t(a)`
  color: #bf4f74;
  font-weight: bold;
`,g=t(a)`
  @media print {
    display: block;
  }
`,_=t(s)`
  @media print {
    display: block;
  }
`,v=t(f)`
  @media print {
    display: block;
  }
`,y=t(u)`
  @media print {
    display: block;
  }
`,b=t(a)`
  @media print {
    display: ${e=>e.printDisplay};
  }
`,x=t(a)`
  &:hover {
    @media (hover: hover) {
      background-color: orange;
    }
  }
`,S=t(c)`
  @media print {
    display: block;
  }
`,C=t(a)`
  color: white;
`,w=t(a)`
  background-color: #fef3c7;
`,T=t(a)`
  color: ${e=>e.active?`green`:`gray`};
`,E=t(a)`
  color: red;
`,D=t(a).attrs({type:`button`})`
  display: inline-flex;
  background-color: ${e=>e.$open?`#dbeafe`:`#f8fafc`};
`,O=t(a)`
  color: #14532d;
  ${i(!0)};
`,k=t(d)`
  color: navy;
  line-height: 20px;
`,A=t(d)`
  min-width: var(--column-width);
  flex-shrink: 0;
`,j=t(p)`
  margin-left: 4px;
  color: #2563eb;
`,M=t(l)`
  align-items: center;
  min-width: 24px;
`,N=t(a)`
  border-color: #c084fc;
`,P=t(N)`
  background-color: #f5f3ff;
`,F=t(N)`
  color: #4c1d95;
`,I=t(N)`
  color: #6d28d9;
`,L=t(N)`
  color: #7c3aed;
`,R=t(N)`
  color: #9333ea;
`,z=t(N)`
  color: #a855f7;
`,B=t(N)`
  color: #c084fc;
`,V=t(N)`
  color: #d8b4fe;
`,H=t(N)`
  color: #e9d5ff;
`,U=t(N)`
  color: #f3e8ff;
`,W=t(N)`
  color: #581c87;
`,G=t(o)`
  grid-area: br;
  background-color: #e0f2fe;
  border-radius: 4px;
  padding: 16px;
  ${r()}
`,K={caller:{kMnn75:`xujl8zx`,$$css:!0}},q={"--column-width":`96px`,display:`flex`,gap:8,padding:8},J=()=>(0,m.jsxs)(`div`,{style:{display:`flex`,flexWrap:`wrap`,gap:8,padding:16,width:480},children:[(0,m.jsx)(h,{children:`Default`}),(0,m.jsx)(h,{className:`extra-class`,style:{marginTop:4},children:`With external className/style`}),(0,m.jsx)(h,{sx:K.caller,children:`Caller sx`}),(0,m.jsx)(g,{children:`Print display`}),(0,m.jsx)(_,{children:`Default export print`}),(0,m.jsx)(v,{children:`Default identifier print`}),(0,m.jsx)(y,{children:`Directory import print`}),(0,m.jsx)(b,{printDisplay:`block`,children:`Dynamic print display`}),(0,m.jsx)(x,{children:`Hover media`}),(0,m.jsx)(S,{children:`Nested sx scope`}),(0,m.jsx)(C,{children:`Primary 1`}),(0,m.jsx)(C,{children:`Primary 2`}),(0,m.jsx)(w,{sx:K.caller,children:`Inlined with caller sx`}),(0,m.jsx)(T,{active:!0,children:`Active forwarded`}),(0,m.jsx)(T,{children:`Inactive forwarded`}),(0,m.jsx)(E,{children:`Exported`}),(0,m.jsx)(E,{sx:K.caller,children:`Exported with caller sx`}),(0,m.jsx)(D,{$open:!0,sx:K.caller,children:`Exported toggle`}),(0,m.jsx)(O,{sx:K.caller,children:`Draggable sx`}),(0,m.jsx)(k,{size:`md`,children:`Generic Text`}),(0,m.jsx)(j,{color:`currentColor`,"aria-label":`Imported icon`}),(0,m.jsx)(M,{delay:100,children:`Imported tooltip`}),(0,m.jsx)(P,{sx:K.caller,children:`Interface wrapper`}),(0,m.jsx)(I,{sx:K.caller,children:`Imported type wrapper`}),(0,m.jsx)(L,{sx:K.caller,children:`Imported interface wrapper`}),(0,m.jsx)(R,{sx:K.caller,children:`Namespace type wrapper`}),(0,m.jsx)(z,{sx:K.caller,children:`Namespace interface wrapper`}),(0,m.jsx)(B,{sx:K.caller,children:`Barrel type wrapper`}),(0,m.jsx)(V,{sx:K.caller,children:`Default imported type wrapper`}),(0,m.jsx)(H,{sx:K.caller,children:`Default barrel type wrapper`}),(0,m.jsx)(U,{sx:K.caller,children:`Local default type wrapper`}),(0,m.jsx)(F,{sx:K.caller,children:`Explicit wrapper`}),(0,m.jsx)(W,{children:`Omit sx wrapper`}),(0,m.jsx)(G,{justify:`center`,align:`center`,gap:16,children:`Tombstone flex`}),(0,m.jsxs)(`div`,{style:q,children:[(0,m.jsx)(A,{color:`labelMuted`,children:`ABC-123`}),(0,m.jsx)(`span`,{children:`Item title`})]})]});export{J as App,O as DraggableSxButton,E as ExportedAccentButton,D as ExportedToggleButton};