const { Op } = require('sequelize');
const { User } = require('../../models');

exports.deductCredit = async (userId, callback) => {
    try {
        const [[undefined, affectedRows]] = await User.decrement('credits', {
            by: 1,
            where: { id: userId, credits: { [Op.gt]: 0 } }
        });

        if (affectedRows === 0) {
            callback(new Error('Insufficient credits'), null);
        } else {
            callback(null, true);
        }
    } catch (err) {
        callback(err, null);
    }
};
