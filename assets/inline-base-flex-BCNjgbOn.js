import{s as e,c}from"./index-BkhvWVJG.js";const r={start:"flex-start",center:"center",end:"flex-end",stretch:"stretch"},n=c.div`
  display: flex;
  ${({column:t,direction:s})=>t?e`
          flex-direction: column;
        `:s?e`
            flex-direction: ${s};
          `:""}
  ${({gap:t})=>t!==void 0?e`
          gap: ${t}px;
        `:""}
  ${({align:t})=>t?e`
          align-items: ${r[t]};
        `:""}
`;export{n as F};
