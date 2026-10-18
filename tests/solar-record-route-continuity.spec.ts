import {afterEach,describe,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({status:vi.fn(),read:vi.fn(),list:vi.fn()}));
vi.mock('../server/services/helix-account/account-session-store',()=>({getAccountSessionStatus:mocks.status}));
vi.mock('../server/services/solar-research/profile-record-reader',()=>({
  SolarResearchProfileRecordReader:class {read=mocks.read;list=mocks.list;},
}));
vi.mock('../server/services/hud-surface/surface-registry-service',()=>({surfaceRegistryService:{}}));
vi.mock('../server/services/helix-ask/realtime-room/experimental-access-cleanup',()=>({leaveSharedRealtimeRoomsForExperimentDisable:vi.fn()}));
import {accountSessionRouter} from '../server/routes/account-session';
const recordId=`solar-primary:${'a'.repeat(64)}`;
function status(profileId='profile-a',sessionId='session-a',accountType='developer') {
  return {session:{profile:{profile_id:profileId},session_id:sessionId},account_policy:{account_type:accountType}};
}
const handler=(accountSessionRouter as any).stack.find((layer:any)=>layer.route?.path==='/solar-research/records').route.stack[0].handle;
function response() {
  return {code:200,body:null as any,setHeader:vi.fn(),status(code:number){this.code=code;return this;},json(body:unknown){this.body=body;return this;}};
}
afterEach(()=>vi.resetAllMocks());
describe('Solar browser record publication authority',()=>{
  for(const operation of ['read','list'] as const) {
    it.each([
      ['sign-out',{session:null,account_policy:{account_type:'user'}},401,'profile_session_required'],
      ['policy change',status('profile-a','session-a','user'),403,'account_policy_blocked'],
      ['profile change',status('profile-b'),409,'profile_storage_account_changed'],
      ['session replacement',status('profile-a','session-b'),409,'profile_storage_account_changed'],
    ])(`blocks %s during delayed ${operation}`,async(_name,current,code,error)=>{
      mocks.status.mockResolvedValueOnce(status()).mockResolvedValueOnce(current);
      let release!: (value:unknown)=>void;
      mocks[operation].mockReturnValue(new Promise(resolve=>{release=resolve;}));
      const res=response();
      const req={headers:{},query:{expected_profile_id:'profile-a',...(operation==='read'?{recordId}:{})}};
      const pending=handler(req,res);
      await vi.waitFor(()=>expect(mocks[operation]).toHaveBeenCalledOnce());
      expect(res.body).toBeNull();
      release(operation==='read'?{bundle:{private:'synthetic'}}:{records:[{private:'synthetic'}]});
      await pending;
      expect(res.code).toBe(code);expect(res.body).toEqual({ok:false,error});
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
      expect(mocks.status).toHaveBeenCalledTimes(2);
    });
    it(`allows ${operation} when the same developer session remains current`,async()=>{
      mocks.status.mockResolvedValue(status());
      mocks[operation].mockResolvedValue(operation==='read'?{bundle:{synthetic:true}}:{records:[]});
      const res=response();
      await handler({headers:{},query:{expected_profile_id:'profile-a',...(operation==='read'?{recordId}:{})}},res);
      expect(res.code).toBe(200);expect(res.body.ok).toBe(true);expect(mocks.status).toHaveBeenCalledTimes(2);
    });
  }
});
