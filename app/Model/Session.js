'use strict'

const Lucid = use('Lucid')

class Session extends Lucid {
  user () {
    return this.belongsTo('App/Model/User')
  }

  activity() {
  	return this.belongsto('App/Model/Activity')
  }
}

module.exports = Session
