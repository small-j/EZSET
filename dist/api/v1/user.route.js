'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _express = require('express');

var _randomNumberCsprng = require('random-number-csprng');

var _randomNumberCsprng2 = _interopRequireDefault(_randomNumberCsprng);

var _api = require('../../utils/api');

var _expressValidator = require('express-validator');

var _User = require('../../models/User');

var _User2 = _interopRequireDefault(_User);

var _config = require('../../utils/config');

var _cachegoose = require('cachegoose');

var _role = require('../../utils/role');

var _role2 = _interopRequireDefault(_role);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

const router = (0, _express.Router)();

/**
 * @api {get} /user 유저 조회
 * @apiDescription 유저의 전체 목록을 가져옴
 * @apiName Users
 * @apiGroup user
 *
 * @apiSuccess {Number} total 결과의 개수
 * @apiSuccess {Object[]} users 유저 정보 리스트
 *
 * @apiSuccessExample {json} Success-Response:
 *       HTTP/1.1 200 OK
 *       {
 *          "total":1,
 *          "users":[
 *              {"username":"admin","realname":"관리자","roles":["admin"]}
 *          ]
 *      }
 */
router.route('/').get([_role2.default.perm('manageUsers').can('access'), (0, _expressValidator.query)('page').custom(_api.isPositive).optional(), (0, _expressValidator.query)('pagesize').custom(_api.isPositive).optional(), _api.validateParams], (0, _api.asyncRoute)(async (req, res) => {
    let query;

    const total = await _User2.default.count();

    if (req.query.page) {
        // 페이지 쿼리 존재할때
        const page = parseInt(req.query.page);
        const pagesize = parseInt(req.query.pagesize || 30);

        query = _User2.default.find().limit(pagesize).skip((page - 1) * pagesize);
    } else {
        // 페이지 쿼리 없을 때
        query = _User2.default.find();
    }

    const users = await query.sort('username').select('username info roles');

    res.json({
        total,
        users: users.map(user => {
            return {
                username: user.username,
                realname: user.info.realname || '',
                roles: user.roles
            };
        })
    });
}));

/**
 * @api {delete} /user/:username 유저 회원 탈퇴
 * @apiDescription 아이디가 username 인 유저를 탈퇴시킴
 * @apiName DeleteUser
 * @apiGroup user
 *
 */
router.delete('/:username', [(0, _expressValidator.param)('username').custom(_api.checkUsername), _api.validateParams], (0, _api.asyncRoute)(async (req, res) => {
    if (!_role2.default.perm('manageUsers').can('access') && req.params.username === req.user.username) {
        const err = new Error('권한이 없습니다.');
        err.status = 403;
        throw err;
    }

    if ((await (0, _config.getConfig)('superAdmin')) == req.params.username) {
        const err = new Error('admin 계정은 탈퇴할 수 없습니다.');
        err.status = 403;
        throw err;
    }

    const user = await _User2.default.findOne().where('username').equals(req.params.username);
    await user.remove();
    res.status(200).end();
}));

/**
 * @api {post} /user/:username/resetpassword 유저 회원 탈퇴
 * @apiDescription 아이디가 username 인 유저의 비밀번호를 초기화시킴
 * @apiName ResetUserPassword
 * @apiGroup user
 *
 */
router.post('/:username/resetpassword', [_role2.default.perm('manageUsers').can('access'), (0, _expressValidator.param)('username').custom(_api.checkUsername), _api.validateParams], (0, _api.asyncRoute)(async (req, res) => {
    const user = await _User2.default.findOne().where('username').equals(req.params.username);
    const newpasswd = (await (0, _randomNumberCsprng2.default)(11, 35)).toString(36) + (await (0, _randomNumberCsprng2.default)(36 ** 7, 36 ** 8)).toString(36);
    user.password = newpasswd;

    await user.save();

    res.json({ new_password: newpasswd });
}));

/**
 * @api {get} /user/:username/role 유저 역할 가져오기
 * @apiDescription 아이디가 username 인 유저에게 부여된 역할들을 가져옴
 * @apiName UserRoles
 * @apiGroup user
 *
 */
router.get('/:username/role', [_role2.default.perm('role', 'user').can('read'), (0, _expressValidator.param)('username').isString(), _api.validateParams], (0, _api.asyncRoute)(async (req, res) => {
    const user = await _User2.default.findOne().where('username').equals(req.params.username).select('roles');
    // .cache(0, 'USER-ROLE-' + req.user.username)

    if (!user) {
        const err = new Error('해당 유저가 없습니다.');
        err.status = 404;
        throw err;
    }

    res.json({
        roles: user.roles
    });
}));

/**
 * @api {put} /user/:username/role 유저 역할 부여
 * @apiDescription 아이디가 username 인 유저의 역할을 설정함
 * @apiName SetUserRole
 * @apiGroup user
 *
 * @apiParam {String[]} roletags 설정할 역할들의 태그들
 *
 * @apiParamExample {json} Request-Example:
 *      {roletags: ["admin"]}
 *
 */
router.put('/:username/role', [_role2.default.perm('role').can('modify'), (0, _expressValidator.param)('username').custom(_api.checkUsername), (0, _expressValidator.body)('roletags').custom(_api.checkRoleTagArray), _api.validateParams], (0, _api.asyncRoute)(async (req, res) => {
    const user = await _User2.default.findOne().where('username').equals(req.params.username);

    if (!user) {
        const err = new Error('해당 유저가 없습니다.');
        err.status = 404;
        throw err;
    }

    if (req.body.roletags.indexOf('admin') < 0) {
        if ((await (0, _config.getConfig)('superAdmin')) == req.params.username) {
            const err = new Error('서버 관리자의 어드민 역할은 변경할 수 없습니다.');
            err.status = 403;
            throw err;
        }
    }

    if (req.body.roletags.includes('default')) {
        const err = new Error('default 역할은 변경할 수 없습니다.');
        err.status = 403;
        throw err;
    }

    user.roles = req.body.roletags;
    await user.save();
    (0, _cachegoose.clearCache)('USER-ROLE-' + req.user.username);

    res.end();
}));

/**
 * @api {post} /user/:username/role 유저 역할 부여
 * @apiDescription 아이디가 username 인 유저에게 역할을 부여함
 * @apiName AddUserRole
 * @apiGroup user
 *
 * @apiParam {String} roletag 부여할 역할의 roletag
 *
 */
router.post('/:username/role', [_role2.default.perm('role').can('modify'),
// param('username').isString(),
(0, _expressValidator.param)('username').custom(_api.checkUsername), (0, _expressValidator.body)('roletag').custom(_api.checkRoleTag), _api.validateParams], (0, _api.asyncRoute)(async (req, res) => {
    const user = await _User2.default.findOne().where('username').equals(req.params.username);

    if (!user) {
        const err = new Error('해당 유저가 없습니다.');
        err.status = 404;
        throw err;
    }

    if (req.body.roletag == 'default') {
        const err = new Error('default 역할은 변경할 수 없습니다.');
        err.status = 403;
        throw err;
    }

    if (user.roles.indexOf(req.body.roletag) == -1) {
        user.roles.push(req.body.roletag);
        await user.save();
    }
    (0, _cachegoose.clearCache)('USER-ROLE-' + req.user.username);
    res.status(200).json({});
}));

/**
 * @api {delete} /user/:username/role/:roletag 유저의 역할 제거
 * @apiDescription 아이디가 username 인 유저의, 태그가 roletag인 역할을 빼버림
 * @apiName DeleteUserRole
 * @apiGroup user
 *
 */
router.delete('/:username/role/:roletag', [_role2.default.perm('role').can('modify'), (0, _expressValidator.param)('username').custom(_api.checkUsername), (0, _expressValidator.param)('roletag').custom(_api.checkRoleTag), _api.validateParams], (0, _api.asyncRoute)(async (req, res) => {
    const user = await _User2.default.findOne().where('username').equals(req.params.username);

    if (!user) {
        const err = new Error('해당 유저가 없습니다.');
        err.status = 404;
        throw err;
    }

    if (req.params.roletag == 'admin') {
        if ((await (0, _config.getConfig)('superAdmin')) == req.params.username) {
            const err = new Error('서버 관리자의 어드민 역할은 변경할 수 없습니다.');
            err.status = 403;
            throw err;
        }
    }

    const idx = user.roles.indexOf(req.params.roletag);
    if (idx != -1) {
        user.roles.splice(idx, 1);
        await user.save();
    }
    (0, _cachegoose.clearCache)('USER-ROLE-' + req.user.username);
    res.status(200).json({});
}));

exports.default = router;
//# sourceMappingURL=user.route.js.map